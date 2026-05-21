import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";

import outputs from "../../../amplify_outputs.json";

Amplify.configure(outputs);

const client = generateClient<Schema>();

function moneyToNumber(value: string | number | null | undefined) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[$,]/g, ""));
}

function makeBidderDisplayName(value: string) {
  if (!value) return "";
  if (value.startsWith("Bidder ")) return value;
  return `Bidder ${value.slice(0, 4).toUpperCase()}`;
}

export const handler = async (event: any) => {
  try {
    const { auctionId } = event.arguments;

    const auctionResult = await client.models.Auction.get(
      { id: auctionId },
      { authMode: "apiKey" },
    );

    const auction = auctionResult.data;

    if (!auction) {
      return {
        success: false,
        message: "Auction not found",
        status: "NOT_FOUND",
      };
    }

    if (auction.ended) {
      return {
        success: true,
        message: "Auction already finalized",
        status: auction.status || "ENDED",
      };
    }

    const stateResult = await client.models.AuctionState.get(
      { auctionId },
      { authMode: "apiKey" },
    );

    const state = stateResult.data;

    const finalPrice = moneyToNumber(state?.currentPrice || auction.price || 0);

    const reservePrice = moneyToNumber(auction.reservePrice || 0);
    const reserveMet = reservePrice === 0 || finalPrice >= reservePrice;

    const winnerUserId =
      state?.leaderUserId || auction.winnerUserId || auction.winnerEmail || "";

    const finalStatus = reserveMet ? "ENDED" : "RESERVE_NOT_MET";

    await client.models.Auction.update(
      {
        id: auctionId,
        ended: true,
        status: finalStatus,
        reserveMet,
        winningBid: `$${finalPrice.toLocaleString()}`,
        winnerUserId,
        winnerDisplayName: makeBidderDisplayName(winnerUserId),
        winnerEmail: auction.winnerEmail || "",
      },
      { authMode: "apiKey" },
    );

    await client.models.AuctionState.update(
      {
        auctionId,
        currentPrice: `$${finalPrice.toLocaleString()}`,
        ended: true,
      },
      { authMode: "apiKey" },
    );

    return {
      success: true,
      message: "Auction finalized",
      status: finalStatus,
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
