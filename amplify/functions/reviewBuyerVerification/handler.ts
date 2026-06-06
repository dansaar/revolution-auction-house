import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/reviewBuyerVerification";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

export const handler: Schema["reviewBuyerVerification"]["functionHandler"] =
  async (event) => {
    const { userId, approved } = event.arguments;

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
      await client.models.BuyerProfile.update({
        userId,
        verificationTier:
          profile.requestedTier || profile.verificationTier || "BASIC",
        bidLimit: Number(profile.requestedLimit || profile.bidLimit || 1000),
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
      message: approved ? "Buyer limit approved" : "Request declined",
    };
  };
