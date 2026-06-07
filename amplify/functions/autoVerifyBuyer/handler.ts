import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/autoVerifyBuyer";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

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
  const { email, stripeSessionId, webhookToken } = event.arguments;

  const expectedToken = (env as any).AUTO_VERIFY_TOKEN || "";

  if (!expectedToken || webhookToken !== expectedToken) {
    console.warn("autoVerifyBuyer: invalid token", { stripeSessionId });
    return { success: false };
  }

  if (!email) {
    console.warn("autoVerifyBuyer: missing email", { stripeSessionId });
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

  return { success: true };
};
