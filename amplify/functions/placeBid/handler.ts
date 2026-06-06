import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/placeBid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const AUCTION_TABLE_NAME = (env as any).AUCTION_TABLE_NAME;
const AUCTION_STATE_TABLE_NAME = (env as any).AUCTION_STATE_TABLE_NAME;
const BID_TABLE_NAME = (env as any).BID_TABLE_NAME;
const BUYER_PROFILE_TABLE_NAME = (env as any).BUYER_PROFILE_TABLE_NAME;
const BID_AUDIT_LOG_TABLE_NAME = (env as any).BID_AUDIT_LOG_TABLE_NAME;

for (const [name, val] of [
  ["AUCTION_TABLE_NAME", AUCTION_TABLE_NAME],
  ["AUCTION_STATE_TABLE_NAME", AUCTION_STATE_TABLE_NAME],
  ["BID_TABLE_NAME", BID_TABLE_NAME],
  ["BUYER_PROFILE_TABLE_NAME", BUYER_PROFILE_TABLE_NAME],
  ["BID_AUDIT_LOG_TABLE_NAME", BID_AUDIT_LOG_TABLE_NAME],
]) {
  if (!val) throw new Error(`Missing env var: ${name}`);
}

const BID_COOLDOWN_MS = 3000;

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

async function getAuctionStateDirect(auctionId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: AUCTION_STATE_TABLE_NAME,
      Key: {
        auctionId,
      },
    }),
  );

  return result.Item || null;
}

async function getBuyerProfileDirect(userId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: BUYER_PROFILE_TABLE_NAME,
      Key: {
        userId,
      },
    }),
  );

  return result.Item || null;
}

async function getBidAuditLogDirect(bidRequestId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: BID_AUDIT_LOG_TABLE_NAME,
      Key: { bidRequestId },
    }),
  );
  return result.Item || null;
}

async function getAuctionDirect(auctionId: string) {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: AUCTION_TABLE_NAME,
      Key: { id: auctionId },
    }),
  );
  return result.Item || null;
}

async function writeBidDirect(bid: {
  auctionId: string;
  bidderUserId: string;
  bidderEmail: string;
  bidderName: string;
  amount: string;
  maxBid: string;
  isProxy: boolean;
  createdAt: string;
}) {
  const id = crypto.randomUUID();
  await dynamoClient.send(
    new PutCommand({
      TableName: BID_TABLE_NAME,
      Item: {
        __typename: "Bid",
        id,
        ...bid,
        updatedAt: bid.createdAt,
      },
    }),
  );
  return id;
}

async function updateAuctionPriceDirect({
  auctionId,
  price,
  bids,
  winnerUserId,
  winnerDisplayName,
  winnerEmail,
  winningBid,
  endsAt,
  stateVersion,
}: {
  auctionId: string;
  price: string;
  bids: number;
  winnerUserId: string;
  winnerDisplayName: string;
  winnerEmail: string;
  winningBid: string;
  endsAt: string | null | undefined;
  stateVersion: number;
}) {
  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: AUCTION_TABLE_NAME,
        Key: { id: auctionId },
        UpdateExpression: `SET price = :price,
          bids = :bids,
          winnerUserId = :winnerUserId,
          winnerDisplayName = :winnerDisplayName,
          winnerEmail = :winnerEmail,
          winningBid = :winningBid,
          endsAt = :endsAt,
          updatedAt = :updatedAt,
          stateVersion = :stateVersion`,
        ConditionExpression:
          "attribute_not_exists(stateVersion) OR stateVersion < :stateVersion",
        ExpressionAttributeValues: {
          ":price": price,
          ":bids": bids,
          ":winnerUserId": winnerUserId,
          ":winnerDisplayName": winnerDisplayName,
          ":winnerEmail": winnerEmail,
          ":winningBid": winningBid,
          ":endsAt": endsAt ?? null,
          ":updatedAt": new Date().toISOString(),
          ":stateVersion": stateVersion,
        },
      }),
    );
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      // A later bid already wrote a higher stateVersion — our update is stale, skip it
      return;
    }
    throw err;
  }
}

async function writeBidAuditLogDirect(log: {
  bidRequestId: string;
  auctionId: string;
  bidderUserId?: string;
  bidderEmail?: string;
  bidderName?: string;
  requestedMaxBid?: string;
  accepted: boolean;
  rejectionReason?: string;
  previousPrice?: string;
  newPrice?: string;
  previousLeaderUserId?: string;
  newLeaderUserId?: string;
  buyerTier?: string;
  buyerBidLimit?: number;
  attemptCount?: number;
  resultMessage?: string;
}) {
  await dynamoClient.send(
    new UpdateCommand({
      TableName: BID_AUDIT_LOG_TABLE_NAME,

      Key: {
        bidRequestId: log.bidRequestId,
      },

      UpdateExpression: `

    SET #typename = :typename,
        auctionId = :auctionId,
        bidderUserId = :bidderUserId,
        bidderEmail = :bidderEmail,
        bidderName = :bidderName,
        requestedMaxBid = :requestedMaxBid,
        accepted = :accepted,
        rejectionReason = :rejectionReason,
        previousPrice = :previousPrice,
        newPrice = :newPrice,
        previousLeaderUserId = :previousLeaderUserId,
        newLeaderUserId = :newLeaderUserId,
        buyerTier = :buyerTier,
        buyerBidLimit = :buyerBidLimit,
        attemptCount = :attemptCount,
        resultMessage = :resultMessage,
        updatedAt = :updatedAt,
        createdAt = if_not_exists(createdAt, :createdAt)
  `,
      ExpressionAttributeNames: {
        "#typename": "__typename",
      },

      ExpressionAttributeValues: {
        ":typename": "BidAuditLog",
        ":auctionId": log.auctionId,
        ":bidderUserId": log.bidderUserId || null,
        ":bidderEmail": log.bidderEmail || null,
        ":bidderName": log.bidderName || null,
        ":requestedMaxBid": log.requestedMaxBid || null,
        ":accepted": log.accepted,
        ":rejectionReason": log.rejectionReason || null,
        ":previousPrice": log.previousPrice || null,
        ":newPrice": log.newPrice || null,
        ":previousLeaderUserId": log.previousLeaderUserId || null,
        ":newLeaderUserId": log.newLeaderUserId || null,
        ":buyerTier": log.buyerTier || null,
        ":buyerBidLimit": log.buyerBidLimit || null,
        ":attemptCount": log.attemptCount || 0,
        ":resultMessage": log.resultMessage || null,
        ":updatedAt": new Date().toISOString(),
        ":createdAt": new Date().toISOString(),
      },
    }),
  );
}

async function updateAuctionStateDirect({
  auctionId,
  visiblePrice,
  newLeaderUserId,
  leaderEmail,
  newLeaderMaxBid,
  newSecondUserId,
  secondEmail,
  newSecondMaxBid,
  newBidCount,
  expectedVersion,
  updatedEndsAt,
  ended,
}: {
  auctionId: string;
  visiblePrice: number;
  newLeaderUserId: string;
  leaderEmail?: string | null;
  newLeaderMaxBid: number;
  newSecondUserId: string;
  secondEmail?: string | null;
  newSecondMaxBid: number;
  newBidCount: number;
  expectedVersion: number;
  updatedEndsAt?: string | null;
  ended: boolean;
}) {
  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: AUCTION_STATE_TABLE_NAME,
        Key: {
          auctionId,
        },
        UpdateExpression: `
          SET currentPrice = :currentPrice,
              leaderUserId = :leaderUserId,
              leaderEmail = :leaderEmail,
              leaderMaxBid = :leaderMaxBid,
              secondUserId = :secondUserId,
              secondEmail = :secondEmail,
              secondMaxBid = :secondMaxBid,
              bidCount = :bidCount,
              version = :nextVersion,
              endsAt = :endsAt,
              ended = :ended,
              updatedAt = :updatedAt
        `,
        ConditionExpression: "#version = :expectedVersion",
        ExpressionAttributeNames: {
          "#version": "version",
        },
        ExpressionAttributeValues: {
          ":currentPrice": formatMoney(visiblePrice),
          ":leaderUserId": newLeaderUserId || null,
          ":leaderEmail": leaderEmail || null,
          ":leaderMaxBid": formatMoney(newLeaderMaxBid),
          ":secondUserId": newSecondUserId || null,
          ":secondEmail": secondEmail || null,
          ":secondMaxBid": formatMoney(newSecondMaxBid),
          ":bidCount": newBidCount,
          ":nextVersion": expectedVersion + 1,
          ":endsAt": updatedEndsAt || null,
          ":ended": ended,
          ":updatedAt": new Date().toISOString(),
          ":expectedVersion": expectedVersion,
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    return result.Attributes || null;
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      return null;
    }

    throw err;
  }
}

export const handler: Schema["placeBid"]["functionHandler"] = async (event) => {
  try {
    const { auctionId, maxBid } = event.arguments;

    const bidRequestId =
      event.arguments.bidRequestId ||
      `${auctionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

    const auctionOwnerCheck = await getAuctionDirect(auctionId);
    if (auctionOwnerCheck?.sellerUserId === bidderUserId) {
      return {
        success: false,
        message: "Sellers cannot bid on their own auctions.",
        currentPrice: 0,
        winner: "",
      };
    }

    const existingAuditLog = await getBidAuditLogDirect(bidRequestId);

    if (existingAuditLog) {
      return {
        success: Boolean(existingAuditLog.accepted),
        message:
          existingAuditLog.resultMessage ||
          (existingAuditLog.accepted
            ? "Bid already processed"
            : "Bid rejected"),
        currentPrice: moneyToNumber(existingAuditLog.newPrice),
        winner: existingAuditLog.newLeaderUserId
          ? makeBidderDisplayName(existingAuditLog.newLeaderUserId)
          : "",
      };
    }

    const buyerProfile = await getBuyerProfileDirect(bidderUserId);

    const buyerBidLimit = Number(buyerProfile?.bidLimit || 1000);
    const buyerTier = String(buyerProfile?.verificationTier || "BASIC");

    if (maxBid > buyerBidLimit) {
      const message = `Your ${buyerTier} bidding limit is ${formatMoney(
        buyerBidLimit,
      )}. Please request a higher limit before placing this bid.`;

      await writeBidAuditLogDirect({
        bidRequestId,
        auctionId,
        bidderUserId,
        bidderEmail,
        bidderName: bidderDisplayName,
        requestedMaxBid: formatMoney(maxBid),
        accepted: false,
        rejectionReason: "BID_LIMIT_EXCEEDED",
        buyerTier,
        buyerBidLimit,
        resultMessage: message,
      });

      return {
        success: false,
        message,
        currentPrice: 0,
        winner: "",
      };
    }

    if (BID_COOLDOWN_MS > 0) {
      const recentUserBids = await client.models.Bid.bidsByBidder(
        { bidderUserId },
        {
          limit: 5,
        } as any,
      );

      const tooRecent = (recentUserBids.data || []).some((bid: any) => {
        if (bid.auctionId !== auctionId || !bid.createdAt) return false;
        return Date.now() - new Date(bid.createdAt).getTime() < BID_COOLDOWN_MS;
      });

      if (tooRecent) {
        return {
          success: false,
          message: "Please wait a few seconds before bidding again.",
          currentPrice: 0,
          winner: "",
        };
      }
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      let state = await getAuctionStateDirect(auctionId);

      if (!state) {
        const auction = await getAuctionDirect(auctionId);

        if (!auction) {
          return {
            success: false,
            message: `Auction not found: ${auctionId}`,
            currentPrice: 0,
            winner: "",
          };
        }

        const initNow = new Date().toISOString();
        const initState = {
          __typename: "AuctionState",
          auctionId,
          currentPrice: auction.price || "$0",
          leaderUserId: null,
          leaderMaxBid: null,
          secondUserId: null,
          secondMaxBid: null,
          bidCount: auction.bids || 0,
          version: 1,
          endsAt: auction.endsAt || null,
          ended: auction.ended || false,
          createdAt: initNow,
          updatedAt: initNow,
        };

        try {
          await dynamoClient.send(
            new PutCommand({
              TableName: AUCTION_STATE_TABLE_NAME,
              Item: initState,
              ConditionExpression: "attribute_not_exists(auctionId)",
            }),
          );
          state = initState;
        } catch (err: any) {
          if (err?.name === "ConditionalCheckFailedException") {
            // Another invocation just initialized it — re-read
            state = await getAuctionStateDirect(auctionId);
          } else {
            throw err;
          }
        }
      }

      if (!state) {
        return {
          success: false,
          message: "Could not initialize auction state",
          currentPrice: 0,
          winner: "",
        };
      }

      if (state.ended) {
        const message = "Auction has ended";

        await writeBidAuditLogDirect({
          bidRequestId,
          auctionId,
          bidderUserId,
          bidderEmail,
          bidderName: bidderDisplayName,
          requestedMaxBid: formatMoney(maxBid),
          accepted: false,
          rejectionReason: "AUCTION_ENDED",
          previousPrice: state.currentPrice,
          previousLeaderUserId: state.leaderUserId || "",
          newPrice: state.currentPrice,
          newLeaderUserId: state.leaderUserId || "",
          buyerTier,
          buyerBidLimit,
          resultMessage: message,
        });

        return {
          success: false,
          message,
          currentPrice: moneyToNumber(state.currentPrice),
          winner: state.leaderUserId
            ? makeBidderDisplayName(state.leaderUserId)
            : "",
        };
      }

      const currentPrice = moneyToNumber(state.currentPrice);
      const minimumBid = currentPrice + getIncrement(currentPrice);

      if (maxBid < minimumBid) {
        const message = `Minimum bid is ${formatMoney(minimumBid)}`;

        await writeBidAuditLogDirect({
          bidRequestId,
          auctionId,
          bidderUserId,
          bidderEmail,
          bidderName: bidderDisplayName,
          requestedMaxBid: formatMoney(maxBid),
          accepted: false,
          rejectionReason: "BELOW_MINIMUM_BID",
          previousPrice: state.currentPrice,
          previousLeaderUserId: state.leaderUserId || "",
          newPrice: state.currentPrice,
          newLeaderUserId: state.leaderUserId || "",
          buyerTier,
          buyerBidLimit,
          resultMessage: message,
        });

        return {
          success: false,
          message,
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
      const SOFT_CLOSE_WINDOW_SEC = 60;
      const SOFT_CLOSE_EXTENSION_SEC = 60;

      let updatedEndsAt = state.endsAt;

      if (state.endsAt) {
        const remainingMs = new Date(state.endsAt).getTime() - Date.now();

        if (remainingMs > 0 && remainingMs <= SOFT_CLOSE_WINDOW_SEC * 1000) {
          updatedEndsAt = new Date(
            Date.now() + SOFT_CLOSE_EXTENSION_SEC * 1000,
          ).toISOString();
        }
      }

      const expectedVersion = state.version || 1;

      const updateResult = await updateAuctionStateDirect({
        auctionId,
        visiblePrice,

        newLeaderUserId,
        leaderEmail:
          newLeaderUserId === bidderUserId ? bidderEmail : state.leaderEmail,
        newLeaderMaxBid,

        newSecondUserId,
        secondEmail:
          newSecondUserId === bidderUserId ? bidderEmail : state.secondEmail,
        newSecondMaxBid,

        newBidCount,
        expectedVersion,

        updatedEndsAt,
        ended: state.ended || false,
      });

      if (!updateResult) {
        console.warn("PLACE_BID_CONFLICT", {
          auctionId,
          attempt: attempt + 1,
          expectedVersion,
          currentPrice,
        });

        if (attempt === 4) {
          const message = "High bidding activity. Please retry.";

          console.error("PLACE_BID_RETRY_EXHAUSTED", {
            auctionId,
            bidderUserId,
            expectedVersion,
            currentPrice,
          });

          await writeBidAuditLogDirect({
            bidRequestId,
            auctionId,
            bidderUserId,
            bidderEmail,
            bidderName: bidderDisplayName,
            requestedMaxBid: formatMoney(maxBid),
            accepted: false,
            rejectionReason: "RETRY_EXHAUSTED",
            previousPrice: state.currentPrice,
            previousLeaderUserId: state.leaderUserId || "",
            newPrice: state.currentPrice,
            newLeaderUserId: state.leaderUserId || "",
            buyerTier,
            buyerBidLimit,
            attemptCount: attempt + 1,
            resultMessage: message,
          });

          return {
            success: false,
            message,
            currentPrice,
            winner: state.leaderUserId
              ? makeBidderDisplayName(state.leaderUserId)
              : "",
          };
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 100 + attempt * 100),
        );

        continue;
      }

      const now = new Date().toISOString();
      await writeBidDirect({
        auctionId,
        bidderUserId,
        bidderEmail,
        bidderName: bidderDisplayName,
        amount: formatMoney(visiblePrice),
        maxBid: formatMoney(maxBid),
        isProxy: false,
        createdAt: now,
      });

      if (proxyUserId) {
        await writeBidDirect({
          auctionId,
          bidderUserId: proxyUserId,
          bidderEmail: "proxy-bid",
          bidderName: makeBidderDisplayName(proxyUserId),
          amount: formatMoney(visiblePrice),
          maxBid: formatMoney(leaderMaxBid),
          isProxy: true,
          createdAt: now,
        });
      }

      await updateAuctionPriceDirect({
        auctionId,
        price: formatMoney(visiblePrice),
        bids: newBidCount,
        winnerUserId: newLeaderUserId,
        winnerDisplayName: makeBidderDisplayName(newLeaderUserId),
        winnerEmail: newLeaderUserId === bidderUserId ? bidderEmail : "",
        winningBid: formatMoney(visiblePrice),
        endsAt: updatedEndsAt,
        stateVersion: expectedVersion + 1,
      });

      await writeBidAuditLogDirect({
        bidRequestId,
        auctionId,
        bidderUserId,
        bidderEmail,
        bidderName: bidderDisplayName,
        requestedMaxBid: formatMoney(maxBid),
        accepted: true,
        previousPrice: state.currentPrice,
        newPrice: formatMoney(visiblePrice),
        previousLeaderUserId: leaderUserId || "",
        newLeaderUserId,
        buyerTier,
        buyerBidLimit,
        attemptCount: attempt + 1,
        resultMessage: "Bid placed",
      });

      return {
        success: true,
        message: "Bid placed",
        currentPrice: visiblePrice,
        winner: makeBidderDisplayName(newLeaderUserId),
      };
    }

    return {
      success: false,
      message: "High bidding activity. Please retry.",
      currentPrice: 0,
      winner: "",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || JSON.stringify(err) || "Failed to place bid",
      currentPrice: 0,
      winner: "",
    };
  }
};
