import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/reviewBuyerVerification";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const snsClient = new SNSClient({});

// Fixed tiers. Private Client AND Trophy are approved at an exact dollar amount
// instead (passed as bidLimit): Private $10K–$1M, Trophy above $1M.
const TIER_LIMITS: Record<string, number> = {
  BASIC: 1_000,
  VERIFIED: 10_000,
  PRIVATE: 1_000_000, // ceiling; actual limit comes from the bidLimit argument
  TROPHY: 1_000_000, // floor; actual ceiling comes from the bidLimit argument
};
const PRIVATE_MIN = 10_000;
const PRIVATE_MAX = 1_000_000;
const TROPHY_MIN = 1_000_000;
const TROPHY_MAX = 100_000_000;

export const handler: Schema["reviewBuyerVerification"]["functionHandler"] =
  async (event) => {
    const { userId, approved, tier: tierOverride, bidLimit } = event.arguments;

    const identity = event.identity as any;
    const claims = identity?.claims ?? {};
    const groups: string[] = claims["cognito:groups"] ?? [];
    const isAdmin = groups.includes("Admin");

    if (!isAdmin) {
      // Access tokens don't carry email — resolve it from BuyerProfile by sub
      const callerSub = String(identity?.sub || claims.sub || "");
      const buyerLookup = await client.models.BuyerProfile.get(
        { userId: callerSub },
        { authMode: "iam" } as any,
      );
      const callerEmail = (buyerLookup.data?.email || "").toLowerCase();

      if (!callerEmail) {
        return { success: false, message: "Unauthorized" };
      }

      const sellerResult = await client.models.SellerProfile.get(
        { email: callerEmail },
        { authMode: "iam" } as any,
      );

      if (!sellerResult.data || sellerResult.data.status !== "APPROVED") {
        return { success: false, message: "Unauthorized" };
      }

      // Sellers cannot approve their own buyer profile
      const selfCheck = await client.models.BuyerProfile.get({ userId });
      if (selfCheck.data?.email?.toLowerCase() === callerEmail) {
        return { success: false, message: "Cannot approve your own profile" };
      }

      // Sellers (and admins) can approve any tier.
      const SELLER_ALLOWED_TIERS = ["BASIC", "VERIFIED", "PRIVATE", "TROPHY"];
      const effectiveTier = tierOverride || "VERIFIED";
      if (!SELLER_ALLOWED_TIERS.includes(effectiveTier)) {
        return { success: false, message: `Unknown tier: ${effectiveTier}` };
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

      // Private Client and Trophy use the exact limit the reviewer entered
      // (clamped to the tier's range); all other tiers use their fixed limit.
      let approvedLimit: number;
      if (approvedTier === "PRIVATE") {
        const requested = Number(bidLimit) || PRIVATE_MIN;
        approvedLimit = Math.min(PRIVATE_MAX, Math.max(PRIVATE_MIN, requested));
      } else if (approvedTier === "TROPHY") {
        const requested = Number(bidLimit) || TROPHY_MIN;
        approvedLimit = Math.min(TROPHY_MAX, Math.max(TROPHY_MIN, requested));
      } else {
        approvedLimit = TIER_LIMITS[approvedTier] ?? TIER_LIMITS["BASIC"];
      }

      await client.models.BuyerProfile.update({
        userId,
        verificationTier: approvedTier,
        bidLimit: approvedLimit,
        status: "APPROVED",
        reviewedAt: new Date().toISOString(),
      });

      // SMS notification (fire-and-forget)
      if (profile.smsOptIn && profile.phoneNumber) {
        const tierName = approvedTier.charAt(0) + approvedTier.slice(1).toLowerCase();
        snsClient.send(new PublishCommand({
          PhoneNumber: profile.phoneNumber,
          Message: `Revolution: Your bid limit has been raised to $${approvedLimit.toLocaleString()} (${tierName} Buyer). revolutionauctionhouse.com`,
        })).catch((err) => console.warn("UPGRADE_SMS_FAILED", err));
      }
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
