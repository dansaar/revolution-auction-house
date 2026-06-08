import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/notifyOfferSms";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const snsClient = new SNSClient({});

const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";

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

    // 5-minute per-listing SMS cooldown to prevent spam
    if (listing.lastOfferSmsAt) {
      const msSinceLast = Date.now() - new Date(listing.lastOfferSmsAt).getTime();
      if (msSinceLast < 5 * 60 * 1000) {
        return { sent: false };
      }
    }

    const result = await client.models.BuyerProfile.buyerProfileByEmail(
      { email: sellerEmail },
      { authMode: "iam" } as any,
    );

    const profile = result.data?.[0];

    if (!profile?.smsOptIn || !profile?.phoneNumber) {
      return { sent: false };
    }

    const link = `${SITE_URL}/seller/listings/${listingId}`;

    await Promise.all([
      snsClient.send(
        new PublishCommand({
          PhoneNumber: profile.phoneNumber,
          Message: `Revolution: New offer on "${listingTitle}" — ${offerAmount}. View: ${link}`,
        }),
      ),
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
