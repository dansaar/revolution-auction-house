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

async function finalizeOneAuction(auction: any) {
  const auctionId = auction.id;

  if (!auctionId || auction.ended) return;

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
}

export const handler = async () => {
  try {
    const now = Date.now();

    const result = await client.models.Auction.list({
      authMode: "apiKey",
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
      finalized: endedOpenAuctions.length,
    };
  } catch (err) {
    console.error("SCHEDULED FINALIZE ERROR", err);

    return {
      success: false,
      finalized: 0,
    };
  }
};
