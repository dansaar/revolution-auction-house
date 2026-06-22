import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/notifyRelist";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const ses = new SESClient({});
const sns = new SNSClient({});

const FROM_EMAIL = (env as any).FROM_EMAIL || "";
const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";
const BUYER_SMS_ENABLED = ((env as any).SMS_AUDIENCE || "all") === "all";

const MAX_RECIPIENTS = 2000;

function emailHtml(title: string, link: string) {
  return `
    <div style="background:#050607;color:#d7d7d7;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#888;margin-bottom:24px">Revolution Auction House</div>
      <h1 style="font-size:28px;margin:0 0 8px;color:#ffffff">It's back up for auction</h1>
      <p style="color:#999;margin:0 0 28px">An item you bid on or watched, <strong style="color:#d7d7d7">${title}</strong>, has been re-listed. Here's another chance to win it.</p>
      <a href="${link}" style="display:inline-block;background:#c0c0c0;color:#000;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px">View Auction →</a>
      <p style="margin-top:32px;font-size:12px;color:#444">You're receiving this because you previously bid on or watched this item at Revolution Auction House.</p>
    </div>`;
}

export const handler: Schema["notifyRelist"]["functionHandler"] = async (event) => {
  const { originalAuctionId, newAuctionId } = event.arguments;
  if (!originalAuctionId || !newAuctionId) {
    return { success: false, notified: 0, message: "Missing auction ids" };
  }

  const identity = event.identity as any;
  const callerSub = String(identity?.sub || identity?.claims?.sub || "");
  const groups: string[] = identity?.claims?.["cognito:groups"] ?? [];
  const isAdmin = groups.includes("Admin");

  try {
    const newAuction = (await client.models.Auction.get({ id: newAuctionId }, { authMode: "iam" } as any)).data;
    if (!newAuction) return { success: false, notified: 0, message: "New auction not found" };

    // Only the seller of the re-listed auction (or an admin) may trigger this.
    if (!isAdmin && String(newAuction.sellerUserId || "") !== callerSub) {
      return { success: false, notified: 0, message: "Unauthorized" };
    }

    const original = (await client.models.Auction.get({ id: originalAuctionId }, { authMode: "iam" } as any)).data;
    const title = newAuction.title || original?.title || "an item";
    const link = `${SITE_URL}/auctions/${newAuctionId}`;

    // Collect recipient subs: previous top bidder + everyone who bid + watchers.
    const subs = new Map<string, string | undefined>(); // sub -> email hint
    const add = (sub?: string | null, email?: string | null) => {
      const s = String(sub || "");
      if (!s || s === String(newAuction.sellerUserId || "")) return; // skip seller
      if (!subs.has(s)) subs.set(s, email || undefined);
    };

    if (original?.winnerUserId) add(original.winnerUserId, original.winnerEmail);

    // All bidders (skip proxy rows).
    let token: string | undefined;
    do {
      const page: any = await (client.models.Bid as any).bidsByAuction(
        { auctionId: originalAuctionId },
        { authMode: "iam", limit: 200, nextToken: token } as any,
      );
      for (const b of page?.data || []) {
        if (b.isProxy) continue;
        add(b.bidderUserId, b.bidderEmail);
      }
      token = page?.nextToken;
    } while (token && subs.size < MAX_RECIPIENTS);

    // Watchers of the original auction.
    token = undefined;
    do {
      const page: any = await (client.models.WatchlistItem as any).watchlistByAuction(
        { auctionId: originalAuctionId },
        { authMode: "iam", limit: 200, nextToken: token } as any,
      );
      for (const w of page?.data || []) add(w.userSub, w.userEmail);
      token = page?.nextToken;
    } while (token && subs.size < MAX_RECIPIENTS);

    const recipients = [...subs.keys()].slice(0, MAX_RECIPIENTS);
    let notified = 0;

    for (const sub of recipients) {
      try {
        const profile = (await client.models.BuyerProfile.get({ userId: sub }, { authMode: "iam" } as any)).data as any;
        const to = (profile?.email as string) || subs.get(sub) || "";

        // Opt-in only: respect the buyer's watchlist notification preference
        // (re-list = "an item you wanted is available again"). Mirrors the
        // watchlist notifications in placeBid.
        const pref = String(profile?.notifyWatchlist || "none");
        const wantsEmail = pref === "email" || pref === "both";
        const wantsSms = pref === "sms" || pref === "both";

        if (FROM_EMAIL && wantsEmail && to && to.includes("@")) {
          await ses.send(new SendEmailCommand({
            Source: `Revolution Auction House <${FROM_EMAIL}>`,
            Destination: { ToAddresses: [to] },
            Message: {
              Subject: { Data: `Re-listed: ${title}` },
              Body: { Html: { Data: emailHtml(title, link) }, Text: { Data: `"${title}" has been re-listed. View: ${link}` } },
            },
          }));
          notified++;
        }
        // SMS only if opted in (sms/both) with a verified phone, when buyer SMS is on.
        if (BUYER_SMS_ENABLED && wantsSms && profile?.phoneVerified && profile?.phoneNumber) {
          await sns.send(new PublishCommand({
            PhoneNumber: profile.phoneNumber as string,
            Message: `Revolution: "${title}" has been re-listed. View: ${link}`,
          }));
        }
      } catch (err) {
        console.warn("NOTIFY_RELIST_RECIPIENT_FAILED", sub, err);
      }
    }

    // Confirmation to the seller with the count.
    const sellerEmail = String(newAuction.sellerEmail || "");
    if (FROM_EMAIL && sellerEmail.includes("@")) {
      try {
        await ses.send(new SendEmailCommand({
          Source: `Revolution Auction House <${FROM_EMAIL}>`,
          Destination: { ToAddresses: [sellerEmail] },
          Message: {
            Subject: { Data: `Re-listed: ${title} — ${notified} buyer${notified === 1 ? "" : "s"} notified` },
            Body: {
              Html: { Data: `
                <div style="background:#050607;color:#d7d7d7;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
                  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#888;margin-bottom:24px">Revolution Auction House</div>
                  <h1 style="font-size:26px;margin:0 0 8px;color:#ffffff">Your auction was re-listed</h1>
                  <p style="color:#999;margin:0 0 24px"><strong style="color:#d7d7d7">${title}</strong> is live again, and we notified <strong style="color:#e7c77f">${notified}</strong> previous bidder${notified === 1 ? "" : "s"} / watcher${notified === 1 ? "" : "s"} by email.</p>
                  <a href="${link}" style="display:inline-block;background:#c0c0c0;color:#000;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:14px">View Listing →</a>
                </div>` },
              Text: { Data: `"${title}" was re-listed. We notified ${notified} previous bidders/watchers. View: ${link}` },
            },
          },
        }));
      } catch (err) {
        console.warn("NOTIFY_RELIST_SELLER_EMAIL_FAILED", err);
      }
    }

    return { success: true, notified, message: "ok" };
  } catch (err: any) {
    console.error("NOTIFY_RELIST_ERROR", err);
    return { success: false, notified: 0, message: err?.message || "Failed" };
  }
};
