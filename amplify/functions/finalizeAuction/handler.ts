import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/finalizeAuction";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const sesClient = new SESClient({});
const snsClient = new SNSClient({});

const FROM_EMAIL = (env as any).FROM_EMAIL || "";
const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";
// Buyer SMS (auction won) only when audience is "all".
const BUYER_SMS_ENABLED = ((env as any).SMS_AUDIENCE || "all") === "all";

async function sendWinnerEmail({
  to,
  auctionTitle,
  auctionId,
  finalPrice,
}: {
  to: string;
  auctionTitle: string;
  auctionId: string;
  finalPrice: string;
}) {
  if (!FROM_EMAIL || !to) return;
  const link = `${SITE_URL}/auctions/${auctionId}/results`;
  await sesClient.send(
    new SendEmailCommand({
      Source: `Revolution Auction House <${FROM_EMAIL}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `Congratulations — you won ${auctionTitle}` },
        Body: {
          Html: {
            Data: `
              <div style="background:#050607;color:#d7d7d7;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#888;margin-bottom:24px">Revolution Auction House</div>
                <h1 style="font-size:28px;margin:0 0 8px;color:#ffffff">You won!</h1>
                <p style="color:#999;margin:0 0 32px">Your bid was the highest on <strong style="color:#d7d7d7">${auctionTitle}</strong>. Complete your purchase to claim this lot.</p>
                <div style="background:#0d0d0f;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px 24px;margin-bottom:28px">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#666;margin-bottom:6px">Winning Bid</div>
                  <div style="font-size:36px;color:#c0c0c0;font-weight:bold">${finalPrice}</div>
                </div>
                <a href="${link}" style="display:inline-block;background:#c0c0c0;color:#000;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px">Complete Purchase →</a>
                <p style="margin-top:32px;font-size:12px;color:#444">You're receiving this because you placed a winning bid at Revolution Auction House.</p>
              </div>`,
          },
        },
      },
    }),
  );
}

async function sendWinnerSms({
  to,
  auctionTitle,
  auctionId,
  finalPrice,
}: {
  to: string;
  auctionTitle: string;
  auctionId: string;
  finalPrice: string;
}) {
  if (!to) return;
  const link = `${SITE_URL}/auctions/${auctionId}/results`;
  await snsClient.send(
    new PublishCommand({
      PhoneNumber: to,
      Message: `Revolution: You won "${auctionTitle}"! Final price: ${finalPrice}. Complete your purchase: ${link}`,
    }),
  );
}

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

  // Below reserve the auction did not sell — clear the winner so no buyer is
  // shown as having won (or owing payment).
  const winnerUserId = reserveMet ? (state?.leaderUserId || auction.winnerUserId || "") : "";

  const winnerEmail = reserveMet ? (state?.leaderEmail || auction.winnerEmail || "") : "";

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

  // Notify winner based on notifyWon preference (fire-and-forget)
  if (reserveMet && (winnerEmail || winnerUserId)) {
    const notifyWon$ = winnerUserId
      ? client.models.BuyerProfile.get({ userId: winnerUserId }, { authMode: "iam" } as any)
          .then((r) => r.data)
          .catch(() => null)
      : Promise.resolve(null);

    notifyWon$.then(async (profile: any) => {
      // Fall back to "both" (legacy: email always fired, SMS fired on smsOptIn)
      const notifyWon = (profile?.notifyWon as string) ?? "both";
      const sends: Promise<any>[] = [];

      if ((notifyWon === "email" || notifyWon === "both") && winnerEmail) {
        sends.push(sendWinnerEmail({
          to: winnerEmail,
          auctionTitle: auction.title || "this auction",
          auctionId,
          finalPrice: formatMoney(finalPrice),
        }));
      }

      if (BUYER_SMS_ENABLED && (notifyWon === "sms" || notifyWon === "both") && profile?.phoneNumber && profile?.phoneVerified) {
        sends.push(sendWinnerSms({
          to: profile.phoneNumber,
          auctionTitle: auction.title || "this auction",
          auctionId,
          finalPrice: formatMoney(finalPrice),
        }));
      }

      if (sends.length) await Promise.all(sends);
    }).catch((err: unknown) => console.warn("WINNER_NOTIFY_FAILED", err));
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

    // Manual action: finalize one auction — caller must be Admin or the auction's seller.
    if (auctionId) {
      const identity = event.identity as any;
      const claims = identity?.claims ?? {};
      const groups: string[] = claims["cognito:groups"] ?? [];
      const isAdmin = groups.includes("Admin");
      // Sellers operate as one team (shared-ops): any Seller can finalize, not
      // just the auction's owner. Lock to the owner if independent sellers join.
      const isSeller = groups.includes("Seller");
      const callerUserId = claims["sub"] as string | undefined;

      if (!isAdmin && !isSeller && !callerUserId) {
        return { success: false, message: "Unauthorized", status: "UNAUTHORIZED" };
      }

      // apiKey read so reservePrice (now field-restricted) comes back — reserve
      // gates whether the auction actually sells.
      const auctionResult = await client.models.Auction.get(
        { id: auctionId },
        { authMode: "apiKey" } as any,
      );
      const auction = auctionResult.data;

      if (!auction) {
        return {
          success: false,
          message: `Auction not found: ${auctionId}`,
          status: "NOT_FOUND",
        };
      }

      if (!isAdmin && !isSeller && auction.sellerUserId !== callerUserId) {
        return { success: false, message: "Unauthorized", status: "UNAUTHORIZED" };
      }

      return await finalizeOneAuction(auction);
    }

    // Scheduled/background behavior: finalize all auctions whose end time passed.
    const now = Date.now();

    const result = await client.models.Auction.list({
      limit: 1000,
      authMode: "apiKey",
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
