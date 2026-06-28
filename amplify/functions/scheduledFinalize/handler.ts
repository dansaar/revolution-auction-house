import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/scheduledFinalize";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

// Direct DynamoDB so reservePrice (field-restricted) is returned without an API
// key — a Lambda has none, so the old apiKey read threw "No api-key configured".
const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const AUCTION_TABLE_NAME = (env as any).AUCTION_TABLE_NAME as string;

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

async function listAllAuctions(): Promise<any[]> {
  const all: any[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const result = await ddbDoc.send(
      new ScanCommand({
        TableName: AUCTION_TABLE_NAME,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    all.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

export const handler = async () => {
  try {
    const now = Date.now();

    const allAuctions = await listAllAuctions();

    // Flip SCHEDULED → LIVE for auctions whose start time has arrived
    const auctionsToActivate = allAuctions.filter((auction: any) => {
      if (auction.status !== "SCHEDULED" || auction.ended) return false;
      if (!auction.startsAt) return false;
      return new Date(auction.startsAt).getTime() <= now;
    });

    for (const auction of auctionsToActivate) {
      await client.models.Auction.update({ id: auction.id, status: "LIVE" });
    }

    const auctionsToFinalize = allAuctions.filter((auction: any) => {
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

      // Below reserve the auction did not sell — clear the winner so no buyer is
      // shown as having won (or owing payment).
      const winnerUserId = reserveMet ? (state?.leaderUserId || auction.winnerUserId || "") : "";
      const winnerEmail = reserveMet ? (state?.leaderEmail || auction.winnerEmail || "") : "";

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
      activated: auctionsToActivate.length,
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
