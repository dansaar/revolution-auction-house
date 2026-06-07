import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/reviewBuyerVerification";

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

export const handler: Schema["reviewBuyerVerification"]["functionHandler"] =
  async (event) => {
    const { userId, approved, tier: tierOverride } = event.arguments;

    const identity = event.identity as any;
    const claims = identity?.claims ?? {};
    const groups: string[] = claims["cognito:groups"] ?? [];
    const isAdmin = groups.includes("Admin");

    if (!isAdmin) {
      const callerEmail = String(claims.email || "").toLowerCase();

      if (!callerEmail) {
        return { success: false, message: "Unauthorized" };
      }

      const sellerResult = await client.models.SellerProfile.get({
        email: callerEmail,
      });

      if (!sellerResult.data || sellerResult.data.status !== "APPROVED") {
        return { success: false, message: "Unauthorized" };
      }
    }

    const profileResult = await client.models.BuyerProfile.get({ userId });
    const profile = profileResult.data;

    if (!profile) {
      return { success: false, message: "Buyer profile not found" };
    }

    if (approved) {
      // Admin-supplied tier overrides the buyer's request; fall back to requested tier, then current tier
      const approvedTier =
        tierOverride ||
        profile.requestedTier ||
        profile.verificationTier ||
        "BASIC";

      const approvedLimit =
        TIER_LIMITS[approvedTier] ?? TIER_LIMITS["BASIC"];

      await client.models.BuyerProfile.update({
        userId,
        verificationTier: approvedTier,
        bidLimit: approvedLimit,
        status: "APPROVED",
        reviewedAt: new Date().toISOString(),
      });
    } else {
      await client.models.BuyerProfile.update({
        userId,
        status: "DECLINED",
        reviewedAt: new Date().toISOString(),
      });
    }

    return {
      success: true,
      message: approved ? "Buyer tier approved" : "Request declined",
    };
  };
