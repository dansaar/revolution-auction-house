import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/verifyPhoneOtp";
import { createHash } from "crypto";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

const MAX_ATTEMPTS = 5;

export const handler: Schema["verifyPhoneOtp"]["functionHandler"] = async (event) => {
  const identity = event.identity as any;
  const userId = identity?.sub || identity?.claims?.sub || "";
  const email = (identity?.claims?.email || "").toLowerCase();
  if (!userId) return { success: false, verified: false, message: "Not authenticated" };

  const target = event.arguments.target === "SELLER" ? "SELLER" : "BUYER";

  const code = (event.arguments.code || "").replace(/\D/g, "");
  if (code.length !== 6) {
    return { success: false, verified: false, message: "Enter the 6-digit code." };
  }

  // Read/update the right profile. Key by email (seller) or sub (buyer);
  // the OTP hash is always scoped to the caller's sub.
  const getProfile = () =>
    target === "SELLER"
      ? client.models.SellerProfile.get({ email } as any, { authMode: "iam" } as any)
      : client.models.BuyerProfile.get({ userId } as any, { authMode: "iam" } as any);
  const updateProfile = (fields: any) =>
    target === "SELLER"
      ? client.models.SellerProfile.update({ email, ...fields } as any, { authMode: "iam" } as any)
      : client.models.BuyerProfile.update({ userId, ...fields } as any, { authMode: "iam" } as any);

  try {
    const res = await getProfile();
    const p = res.data as any;

    if (!p?.phoneOtpHash || !p?.phoneOtpExpiresAt) {
      return { success: false, verified: false, message: "Request a new code." };
    }
    if (new Date(p.phoneOtpExpiresAt).getTime() < Date.now()) {
      return { success: false, verified: false, message: "That code expired — request a new one." };
    }
    if ((p.phoneOtpAttempts || 0) >= MAX_ATTEMPTS) {
      return { success: false, verified: false, message: "Too many attempts — request a new code." };
    }

    if (hashCode(userId, code) !== p.phoneOtpHash) {
      await updateProfile({ phoneOtpAttempts: (p.phoneOtpAttempts || 0) + 1 });
      return { success: false, verified: false, message: "Incorrect code. Try again." };
    }

    await updateProfile({
      phoneVerified: true,
      phoneOtpHash: null,
      phoneOtpExpiresAt: null,
      phoneOtpAttempts: 0,
    });
    return { success: true, verified: true, message: "Phone number verified." };
  } catch (err: any) {
    console.error("VERIFY_PHONE_OTP_ERROR", err);
    return { success: false, verified: false, message: "Verification failed. Please try again." };
  }
};
