import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/sendPhoneOtp";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { createHash } from "crypto";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const sns = new SNSClient({});

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

// Normalize to E.164 (assume US for bare 10-digit numbers).
function normalizePhone(raw: string): string | null {
  let p = (raw || "").trim();
  if (!p.startsWith("+")) {
    const d = p.replace(/\D/g, "");
    if (d.length === 10) p = "+1" + d;
    else if (d.length === 11 && d.startsWith("1")) p = "+" + d;
    else return null;
  } else {
    p = "+" + p.slice(1).replace(/\D/g, "");
  }
  return /^\+\d{8,15}$/.test(p) ? p : null;
}

export const handler: Schema["sendPhoneOtp"]["functionHandler"] = async (event) => {
  const identity = event.identity as any;
  const userId = identity?.sub || identity?.claims?.sub || "";
  if (!userId) return { success: false, message: "Not authenticated" };

  const phone = normalizePhone(event.arguments.phoneNumber || "");
  if (!phone) {
    return { success: false, message: "Enter a valid number with country code, e.g. +15551234567." };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    const existing = await client.models.BuyerProfile.get(
      { userId },
      { authMode: "iam" } as any,
    );
    const otpFields = {
      userId,
      phoneNumber: phone,
      phoneVerified: false,
      phoneOtpHash: hashCode(userId, code),
      phoneOtpExpiresAt: expiresAt,
      phoneOtpAttempts: 0,
    };
    if (existing.data) {
      await client.models.BuyerProfile.update(otpFields as any, { authMode: "iam" } as any);
    } else {
      await client.models.BuyerProfile.create(
        { ...otpFields, email: (identity?.claims?.email || "").toLowerCase() } as any,
        { authMode: "iam" } as any,
      );
    }

    await sns.send(
      new PublishCommand({
        PhoneNumber: phone,
        Message: `Revolution Auction House: your verification code is ${code}. It expires in 10 minutes. Reply STOP to opt out.`,
      }),
    );

    return { success: true, message: "Verification code sent." };
  } catch (err: any) {
    console.error("SEND_PHONE_OTP_ERROR", err);
    return { success: false, message: "Couldn't send the code. Please try again." };
  }
};
