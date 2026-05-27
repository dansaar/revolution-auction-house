import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/finalizeAuction";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

function moneyToNumber(value: string | number | null | undefined) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[$,]/g, ""));
}

function formatMoney(amount: number) {
  return `$${amount.toLocaleString()}`;
}

function makeBidderDisplayName(value: string) {
  if (!value) return "";
  if (value.startsWith("Bidder ")) return value;
  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

async function finalizeOneAuction(auction: any) {
  const auctionId = auction?.id;

  if (!auctionId) {
    return {
      success: false,
      message: "Missing auction ID",
      status: "MISSING_AUCTION_ID",
    };
  }

  if (auction.ended) {
    return {
      success: true,
      message: "Auction already ended",
      status: auction.status || "ALREADY_ENDED",
    };
  }

  const stateResult = await client.models.AuctionState.get({ auctionId });
  const state = stateResult.data;

  const finalPrice = moneyToNumber(state?.currentPrice || auction.price || 0);
  const reservePrice = moneyToNumber(auction.reservePrice || 0);
  const reserveMet = reservePrice === 0 || finalPrice >= reservePrice;

  const winnerUserId = state?.leaderUserId || auction.winnerUserId || "";

  const winnerEmail = state?.leaderEmail || auction.winnerEmail || "";

  const finalStatus = reserveMet ? "ENDED" : "RESERVE_NOT_MET";

  const nowIso = new Date().toISOString();

  const finalEndsAt =
    auction.endsAt && new Date(auction.endsAt).getTime() <= Date.now()
      ? auction.endsAt
      : nowIso;

  await client.models.Auction.update({
    id: auctionId,
    ended: true,
    status: finalStatus,
    reserveMet,
    price: formatMoney(finalPrice),
    winningBid: formatMoney(finalPrice),
    winnerUserId,
    winnerDisplayName: makeBidderDisplayName(winnerUserId),
    winnerEmail,
    endsAt: finalEndsAt,
  });

  if (state) {
    await client.models.AuctionState.update({
      auctionId,
      currentPrice: formatMoney(finalPrice),
      ended: true,
      endsAt: finalEndsAt,
    });
  }

  return {
    success: true,
    message: "Auction finalized",
    status: finalStatus,
  };
}

export const handler = async (event: any = {}) => {
  try {
    const auctionId = event?.arguments?.auctionId;

    // Manual seller action: finalize one auction.
    if (auctionId) {
      const auctionResult = await client.models.Auction.get({ id: auctionId });
      const auction = auctionResult.data;

      if (!auction) {
        return {
          success: false,
          message: `Auction not found: ${auctionId}`,
          status: "NOT_FOUND",
        };
      }

      return await finalizeOneAuction(auction);
    }

    // Scheduled/background behavior: finalize all auctions whose end time passed.
    const now = Date.now();

    const result = await client.models.Auction.list({
      limit: 1000,
    } as any);

    const endedOpenAuctions = (result.data || []).filter((auction: any) => {
      if (!auction.endsAt || auction.ended) return false;
      return new Date(auction.endsAt).getTime() <= now;
    });

    for (const auction of endedOpenAuctions) {
      await finalizeOneAuction(auction);
    }

    return {
      success: true,
      message: `Finalized ${endedOpenAuctions.length} auction(s)`,
      status: "SCHEDULED_FINALIZE_COMPLETE",
    };
  } catch (err: any) {
    console.error("FINALIZE AUCTION ERROR", err);

    return {
      success: false,
      message: err?.message || "Failed to finalize auction",
      status: "ERROR",
    };
  }
};
