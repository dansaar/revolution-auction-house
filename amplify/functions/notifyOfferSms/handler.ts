import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/notifyOfferSms";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const snsClient = new SNSClient({});
const sesClient = new SESClient({});

const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";
const FROM_EMAIL = (env as any).FROM_EMAIL || "";

export const handler: Schema["notifySellerOfferSms"]["functionHandler"] = async (event) => {
  const { sellerEmail, listingId, listingTitle, offerAmount } = event.arguments;

  try {
    // Verify the listing exists and actually belongs to the claimed seller
    const listingResult = await client.models.MarketplaceListing.get(
      { id: listingId },
      { authMode: "iam" } as any,
    );
    const listing = listingResult.data;
    if (!listing || (sellerEmail && listing.sellerEmail?.toLowerCase() !== sellerEmail?.toLowerCase())) {
      console.warn("NOTIFY_OFFER_SMS: listing/seller mismatch", { listingId, sellerEmail });
      return { sent: false };
    }

    // Always mark listing as OFFER_PENDING so the UI updates for all viewers
    await client.models.MarketplaceListing.update(
      { id: listingId, status: "OFFER_PENDING" },
      { authMode: "iam" } as any,
    );

    // 5-minute per-listing notification cooldown to prevent spam
    if (listing.lastOfferSmsAt) {
      const msSinceLast = Date.now() - new Date(listing.lastOfferSmsAt).getTime();
      if (msSinceLast < 5 * 60 * 1000) {
        return { sent: false };
      }
    }

    // Look up seller notification preferences from SellerProfile
    const sellerProfileResult = await client.models.SellerProfile.get(
      { email: sellerEmail },
      { authMode: "iam" } as any,
    );
    const sellerProfile = sellerProfileResult.data as any;

    const pref: string = sellerProfile?.notifyOffers ?? "email";
    const phone: string = sellerProfile?.phoneNumber ?? "";
    const wantsSms = (pref === "sms" || pref === "both") && phone;
    const wantsEmail = (pref === "email" || pref === "both") && FROM_EMAIL;

    if (!wantsSms && !wantsEmail) {
      return { sent: false };
    }

    const link = `${SITE_URL}/seller/listings/${listingId}`;
    const tasks: Promise<any>[] = [];

    if (wantsSms) {
      tasks.push(
        snsClient.send(
          new PublishCommand({
            PhoneNumber: phone,
            Message: `Revolution: New offer on "${listingTitle}" — ${offerAmount}. View: ${link}`,
          }),
        ),
      );
    }

    if (wantsEmail) {
      tasks.push(
        sesClient.send(
          new SendEmailCommand({
            Source: `Revolution Auction House <${FROM_EMAIL}>`,
            Destination: { ToAddresses: [sellerEmail] },
            Message: {
              Subject: { Data: `New offer on "${listingTitle}"` },
              Body: {
                Html: {
                  Data: `<p>You have received a new offer on your listing.</p>
<ul>
  <li><strong>Listing:</strong> ${listingTitle}</li>
  <li><strong>Offer:</strong> ${offerAmount}</li>
</ul>
<p><a href="${link}">View and respond →</a></p>`,
                },
                Text: {
                  Data: `New offer on "${listingTitle}" — ${offerAmount}.\n\nView and respond: ${link}`,
                },
              },
            },
          }),
        ),
      );
    }

    await Promise.all([
      ...tasks,
      client.models.MarketplaceListing.update(
        { id: listingId, lastOfferSmsAt: new Date().toISOString() },
        { authMode: "iam" } as any,
      ),
    ]);

    return { sent: true };
  } catch (err) {
    console.warn("NOTIFY_OFFER_SMS_FAILED", err);
    return { sent: false };
  }
};
