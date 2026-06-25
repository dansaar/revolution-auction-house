import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/confirmReceipt";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const ses = new SESClient({});
const sns = new SNSClient({});

const FROM_EMAIL = (env as any).FROM_EMAIL || "";
const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";
const BUYER_SMS_ENABLED = ((env as any).SMS_AUDIENCE || "all") !== "none";

export const handler: Schema["confirmReceipt"]["functionHandler"] = async (event) => {
  const { itemId, itemType } = event.arguments;
  const identity = event.identity as any;
  const callerSub = String(identity?.sub || identity?.claims?.sub || "");
  if (!callerSub) return { success: false, message: "Not authenticated" };

  try {
    const model = itemType === "AUCTION" ? client.models.Auction : client.models.MarketplaceListing;
    const item = (await (model as any).get({ id: itemId }, { authMode: "iam" } as any)).data;
    if (!item) return { success: false, message: "Order not found" };

    // Verify the caller is the buyer for this order (via the invoice).
    const filter = itemType === "AUCTION" ? { auctionId: { eq: itemId } } : { listingId: { eq: itemId } };
    const invRes = await client.models.Invoice.list({ filter, authMode: "iam" } as any);
    const invoice = (invRes.data || [])[0] as any;
    const isBuyer =
      (invoice && invoice.buyerUserId === callerSub) ||
      (itemType === "AUCTION" && item.winnerUserId === callerSub);
    if (!isBuyer) return { success: false, message: "Only the buyer can confirm receipt" };

    if (item.buyerReceivedAt) {
      return { success: true, message: "Already confirmed" };
    }

    const now = new Date().toISOString();
    await (model as any).update({ id: itemId, buyerReceivedAt: now }, { authMode: "iam" } as any);

    // Notify the seller per their notifyReceipt preference (fire-and-forget).
    try {
      const sellerEmail = String(item.sellerEmail || "");
      if (sellerEmail) {
        const sp = (await client.models.SellerProfile.get({ email: sellerEmail }, { authMode: "iam" } as any)).data as any;
        const pref = String(sp?.notifyReceipt || "email");
        const title = item.title || "your item";
        const link = `${SITE_URL}/seller?tab=shipping`;
        if ((pref === "email" || pref === "both") && FROM_EMAIL) {
          await ses.send(new SendEmailCommand({
            Source: `Revolution Auction House <${FROM_EMAIL}>`,
            Destination: { ToAddresses: [sellerEmail] },
            Message: {
              Subject: { Data: `Buyer confirmed receipt: ${title}` },
              Body: {
                Html: { Data: `<div style="background:#050607;color:#d7d7d7;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.3em;color:#888;margin-bottom:24px">Revolution Auction House</div><h1 style="font-size:24px;margin:0 0 8px;color:#fff">Buyer confirmed receipt</h1><p style="color:#999;margin:0 0 24px">The buyer confirmed they received <strong style="color:#d7d7d7">${title}</strong>.</p><a href="${link}" style="display:inline-block;background:#c0c0c0;color:#000;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px">View Shipping →</a></div>` },
                Text: { Data: `Buyer confirmed receipt of "${title}". ${link}` },
              },
            },
          }));
        }
        if (BUYER_SMS_ENABLED && (pref === "sms" || pref === "both") && sp?.phoneNumber && sp?.phoneVerified) {
          await sns.send(new PublishCommand({
            PhoneNumber: sp.phoneNumber as string,
            Message: `Revolution: Buyer confirmed receipt of "${title}".`,
          }));
        }
      }
    } catch (notifyErr) {
      console.warn("CONFIRM_RECEIPT_NOTIFY_FAILED", notifyErr);
    }

    return { success: true, message: "Receipt confirmed" };
  } catch (err: any) {
    console.error("CONFIRM_RECEIPT_ERROR", err);
    return { success: false, message: err?.message || "Failed to confirm receipt" };
  }
};
