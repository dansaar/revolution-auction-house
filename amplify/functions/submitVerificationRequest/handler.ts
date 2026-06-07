import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/submitVerificationRequest";

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

const VALID_TIERS = Object.keys(TIER_LIMITS);

export const handler: Schema["submitVerificationRequest"]["functionHandler"] =
  async (event) => {
    const { requestedTier, verificationNotes } = event.arguments;

    const identity = event.identity as any;
    const claims = identity?.claims ?? {};
    const userId = claims["sub"] as string | undefined;
    const email = (claims["email"] as string | undefined)?.toLowerCase();

    if (!userId || !email) {
      return { success: false, message: "Not authenticated" };
    }

    const tier = VALID_TIERS.includes(requestedTier) ? requestedTier : "VERIFIED";
    const limit = TIER_LIMITS[tier];

    try {
      const existing = await client.models.BuyerProfile.get(
        { userId },
        { authMode: "iam" } as any,
      );

      if (existing.data) {
        await client.models.BuyerProfile.update(
          {
            userId,
            email,
            requestedTier: tier,
            requestedLimit: limit,
            verificationNotes: verificationNotes ?? "",
            status: "PENDING_REVIEW",
          },
          { authMode: "iam" } as any,
        );
      } else {
        await client.models.BuyerProfile.create(
          {
            userId,
            email,
            displayName: email,
            requestedTier: tier,
            requestedLimit: limit,
            verificationNotes: verificationNotes ?? "",
            status: "PENDING_REVIEW",
          },
          { authMode: "iam" } as any,
        );
      }

      return { success: true, message: "Verification request submitted" };
    } catch (err: any) {
      console.error("SUBMIT_VERIFICATION_REQUEST_ERROR", err);
      return { success: false, message: "Failed to submit request" };
    }
  };
