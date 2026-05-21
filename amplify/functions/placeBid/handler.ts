import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";

import outputs from "../../../amplify_outputs.json";

Amplify.configure(outputs);

const client = generateClient<Schema>();

function getIncrement(amount: number): number {
  if (amount < 100) return 5;
  if (amount < 500) return 10;
  if (amount < 1000) return 25;
  if (amount < 2500) return 50;
  if (amount < 5000) return 100;
  if (amount < 10000) return 250;
  if (amount < 25000) return 500;
  if (amount < 50000) return 1000;
  if (amount < 100000) return 2500;
  if (amount < 250000) return 5000;
  if (amount < 500000) return 10000;
  return 25000;
}

function formatMoney(amount: number) {
  return `$${amount.toLocaleString()}`;
}

function moneyToNumber(value: string | number | null | undefined) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[$,]/g, ""));
}

function makeBidderDisplayName(value: string) {
  if (!value) return "Verified Bidder";
  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

export const handler: Schema["placeBid"]["functionHandler"] = async (event) => {
  try {
    const { auctionId, maxBid } = event.arguments;
    const identity = event.identity as any;

    const bidderUserId =
      identity?.sub ||
      identity?.claims?.sub ||
      identity?.username ||
      identity?.claims?.["cognito:username"] ||
      "guest";

    const bidderEmail =
      identity?.claims?.email ||
      identity?.claims?.["cognito:email"] ||
      `user-${bidderUserId}`;

    const bidderDisplayName = makeBidderDisplayName(bidderUserId);

    const stateResult = await client.models.AuctionState.get(
      { auctionId },
      { authMode: "apiKey" },
    );

    const state = stateResult.data;

    if (!state) {
      return {
        success: false,
        message: "Auction state not found",
        currentPrice: 0,
        winner: "",
      };
    }

    if (state.ended) {
      return {
        success: false,
        message: "Auction has ended",
        currentPrice: moneyToNumber(state.currentPrice),
        winner: state.leaderUserId
          ? makeBidderDisplayName(state.leaderUserId)
          : "",
      };
    }

    const currentPrice = moneyToNumber(state.currentPrice);
    const minimumBid = currentPrice + getIncrement(currentPrice);

    if (maxBid < minimumBid) {
      return {
        success: false,
        message: `Minimum bid is ${formatMoney(minimumBid)}`,
        currentPrice,
        winner: state.leaderUserId
          ? makeBidderDisplayName(state.leaderUserId)
          : "",
      };
    }

    const leaderUserId = state.leaderUserId || "";
    const leaderMaxBid = moneyToNumber(state.leaderMaxBid);
    const secondUserId = state.secondUserId || "";
    const secondMaxBid = moneyToNumber(state.secondMaxBid);

    let newLeaderUserId = leaderUserId;
    let newLeaderMaxBid = leaderMaxBid;
    let newSecondUserId = secondUserId;
    let newSecondMaxBid = secondMaxBid;
    let visiblePrice = currentPrice;
    let proxyUserId = "";

    if (!leaderUserId) {
      newLeaderUserId = bidderUserId;
      newLeaderMaxBid = maxBid;
      visiblePrice = minimumBid;
    } else if (bidderUserId === leaderUserId) {
      newLeaderMaxBid = Math.max(leaderMaxBid, maxBid);
      visiblePrice = currentPrice;
    } else if (maxBid > leaderMaxBid) {
      newSecondUserId = leaderUserId;
      newSecondMaxBid = leaderMaxBid;

      newLeaderUserId = bidderUserId;
      newLeaderMaxBid = maxBid;

      visiblePrice = Math.min(
        maxBid,
        leaderMaxBid + getIncrement(leaderMaxBid),
      );
    } else if (maxBid === leaderMaxBid) {
      newSecondUserId = bidderUserId;
      newSecondMaxBid = maxBid;

      visiblePrice = leaderMaxBid;
      proxyUserId = leaderUserId;
    } else {
      newSecondUserId = bidderUserId;
      newSecondMaxBid = Math.max(secondMaxBid, maxBid);

      visiblePrice = Math.min(leaderMaxBid, maxBid + getIncrement(maxBid));

      proxyUserId = leaderUserId;
    }

    const newBidCount = (state.bidCount || 0) + (proxyUserId ? 2 : 1);

    await client.models.AuctionState.update(
      {
        auctionId,
        currentPrice: formatMoney(visiblePrice),

        leaderUserId: newLeaderUserId,
        leaderMaxBid: formatMoney(newLeaderMaxBid),

        secondUserId: newSecondUserId,
        secondMaxBid: formatMoney(newSecondMaxBid),

        bidCount: newBidCount,
        version: (state.version || 1) + 1,

        endsAt: state.endsAt,
        ended: state.ended || false,
      },
      {
        authMode: "apiKey",
      },
    );

    const bidCreateResult = await client.models.Bid.create(
      {
        auctionId,
        bidderUserId: bidderUserId,
        bidderEmail: bidderEmail,
        bidderName: bidderDisplayName,
        amount: formatMoney(visiblePrice),
        maxBid: formatMoney(maxBid),
        isProxy: false,
        createdAt: new Date().toISOString(),
      },
      {
        authMode: "apiKey",
      },
    );

    console.log("BID CREATE RESULT", JSON.stringify(bidCreateResult));

    if (proxyUserId) {
      await client.models.Bid.create(
        {
          auctionId,
          bidderUserId: proxyUserId,
          bidderEmail: "proxy-bid",
          bidderName: makeBidderDisplayName(proxyUserId),
          amount: formatMoney(visiblePrice),
          maxBid: formatMoney(leaderMaxBid),
          isProxy: true,
          createdAt: new Date().toISOString(),
        },
        {
          authMode: "apiKey",
        },
      );
    }

    await client.models.Auction.update(
      {
        id: auctionId,
        price: formatMoney(visiblePrice),
        bids: newBidCount,

        winnerUserId: newLeaderUserId,
        winnerDisplayName: makeBidderDisplayName(newLeaderUserId),
        winnerEmail: newLeaderUserId === bidderUserId ? bidderEmail : "",
        winningBid: formatMoney(visiblePrice),
      },
      {
        authMode: "apiKey",
      },
    );

    return {
      success: true,
      message: "Bid placed",
      currentPrice: visiblePrice,
      winner: makeBidderDisplayName(newLeaderUserId),
    };
  } catch (err: any) {
    console.error("PLACE BID LAMBDA ERROR", err);

    return {
      success: false,
      message: err?.message || JSON.stringify(err) || "Failed to place bid",
      currentPrice: 0,
      winner: "",
    };
  }
};
