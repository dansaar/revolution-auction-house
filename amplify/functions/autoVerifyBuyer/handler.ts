import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/autoVerifyBuyer";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import Stripe from "stripe";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const snsClient = new SNSClient({});

const STRIPE_SECRET_KEY = (env as any).STRIPE_SECRET_KEY || "";

const TIER_LIMITS: Record<string, number> = {
  BASIC: 1_000,
  VERIFIED: 10_000,
  PREMIUM: 50_000,
  PRIVATE: 250_000,
  TROPHY: 5_000_000,
};

export const handler: Schema["autoVerifyBuyer"]["functionHandler"] = async (
  event,
) => {
  const { email, stripeSessionId } = event.arguments;

  if (!email) {
    console.warn("autoVerifyBuyer: missing email", { stripeSessionId });
    return { success: false };
  }

  if (!STRIPE_SECRET_KEY) {
    console.error("autoVerifyBuyer: STRIPE_SECRET_KEY not set");
    return { success: false };
  }

  // Verify the session status directly with Stripe — this is the security gate
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const session = await stripe.identity.verificationSessions.retrieve(stripeSessionId);
    if (session.status !== "verified") {
      console.warn("autoVerifyBuyer: session not verified", { stripeSessionId, status: session.status });
      return { success: false };
    }
  } catch (err) {
    console.error("autoVerifyBuyer: Stripe session check failed", { stripeSessionId, err });
    return { success: false };
  }

  const profileResult = await client.models.BuyerProfile.buyerProfileByEmail(
    { email },
    { authMode: "iam" } as any,
  );

  const profile = profileResult.data?.[0];

  if (!profile) {
    console.warn("autoVerifyBuyer: no profile for email", { email });
    return { success: false };
  }

  const currentTierIndex = Object.keys(TIER_LIMITS).indexOf(
    profile.verificationTier || "BASIC",
  );
  const verifiedIndex = Object.keys(TIER_LIMITS).indexOf("VERIFIED");

  if (currentTierIndex >= verifiedIndex) {
    // Already VERIFIED or higher — don't downgrade
    return { success: true };
  }

  await client.models.BuyerProfile.update(
    {
      userId: profile.userId,
      verificationTier: "VERIFIED",
      bidLimit: TIER_LIMITS["VERIFIED"],
      status: "APPROVED",
      reviewedAt: new Date().toISOString(),
    },
    { authMode: "iam" } as any,
  );

  console.log("autoVerifyBuyer: upgraded to VERIFIED", { email, stripeSessionId });

  // SMS notification (fire-and-forget)
  if (profile.smsOptIn && profile.phoneNumber) {
    snsClient.send(new PublishCommand({
      PhoneNumber: profile.phoneNumber,
      Message: `Revolution: Your identity has been verified! Your bid limit is now $${TIER_LIMITS["VERIFIED"].toLocaleString()} (Verified Buyer). revolutionauctionhouse.com`,
    })).catch((err) => console.warn("UPGRADE_SMS_FAILED", err));
  }

  return { success: true };
};
