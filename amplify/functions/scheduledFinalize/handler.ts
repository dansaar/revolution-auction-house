import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/scheduledFinalize";

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

export const handler = async () => {
  try {
    const now = Date.now();

    const result = await client.models.Auction.list({
      limit: 1000,
    } as any);

    const auctionsToFinalize = (result.data || []).filter((auction: any) => {
      if (!auction.endsAt || auction.ended) return false;
      return new Date(auction.endsAt).getTime() <= now;
    });

    for (const auction of auctionsToFinalize) {
      const auctionId = auction.id;

      if (!auctionId) continue;

      const stateResult = await client.models.AuctionState.get({ auctionId });
      const state = stateResult.data;

      const finalPrice = moneyToNumber(
        state?.currentPrice || auction.price || 0,
      );

      const reservePrice = moneyToNumber(auction.reservePrice || 0);
      const reserveMet = reservePrice === 0 || finalPrice >= reservePrice;

      const winnerUserId = state?.leaderUserId || auction.winnerUserId || "";
      const winnerEmail = state?.leaderEmail || auction.winnerEmail || "";

      const finalStatus = reserveMet ? "ENDED" : "RESERVE_NOT_MET";

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
      });

      if (state) {
        await client.models.AuctionState.update({
          auctionId,
          currentPrice: formatMoney(finalPrice),
          ended: true,
        });
      }
    }

    return {
      success: true,
      finalized: auctionsToFinalize.length,
    };
  } catch (err) {
    console.error("SCHEDULED FINALIZE ERROR", err);

    return {
      success: false,
      finalized: 0,
    };
  }
};
