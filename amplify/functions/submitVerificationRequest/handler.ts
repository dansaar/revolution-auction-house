import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/submitVerificationRequest";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const sesClient = new SESClient({});
const snsClient = new SNSClient({});
const FROM_EMAIL = (env as any).FROM_EMAIL || "";
const SITE_URL = (env as any).SITE_URL || "https://www.revolutionauctionhouse.com";
// Seller SMS unless audience is "none".
const SELLER_SMS_ENABLED = ((env as any).SMS_AUDIENCE || "all") !== "none";

const TIER_LIMITS: Record<string, number> = {
  BASIC: 1_000,
  VERIFIED: 10_000,
  PRIVATE: 1_000_000, // requested ceiling; the exact limit is set at approval
  TROPHY: 5_000_000,
};

const VALID_TIERS = Object.keys(TIER_LIMITS);

export const handler: Schema["submitVerificationRequest"]["functionHandler"] =
  async (event) => {
    const { requestedTier, verificationNotes } = event.arguments;

    const identity = event.identity as any;
    const claims = identity?.claims ?? {};
    // identity.sub is the reliable source for the caller's Cognito sub;
    // claims.sub can come back empty depending on the AppSync authorizer.
    const userId =
      (identity?.sub as string | undefined) ||
      (claims["sub"] as string | undefined);

    if (!userId) {
      console.error("SUBMIT_VERIFICATION_NO_USER", JSON.stringify(identity));
      return { success: false, message: "Not authenticated" };
    }

    const tier = VALID_TIERS.includes(requestedTier) ? requestedTier : "VERIFIED";
    const limit = TIER_LIMITS[tier];

    try {
      const existing = await client.models.BuyerProfile.get(
        { userId },
        { authMode: "iam" } as any,
      );

      // Prefer the email claim; fall back to the email already stored on the
      // buyer's profile so a missing claim doesn't block the request.
      const email =
        (claims["email"] as string | undefined)?.toLowerCase() ||
        (existing.data?.email || "").toLowerCase();

      if (!email) {
        return { success: false, message: "No email on file for this account" };
      }

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

      // Notify approved sellers per their notification preferences (fire-and-forget)
      if (FROM_EMAIL) {
        try {
          const sellersResult = await client.models.SellerProfile.list({ authMode: "iam" } as any);
          const approvedSellers = (sellersResult.data || []).filter((s: any) => s.status === "APPROVED");

          const emailTo: string[] = [];
          const smsTo: string[] = [];

          for (const s of approvedSellers) {
            const pref = (s as any).notifyVerifications ?? "none";
            if ((pref === "email" || pref === "both") && s.email) emailTo.push(s.email);
            if (SELLER_SMS_ENABLED && (pref === "sms" || pref === "both") && (s as any).phoneNumber && (s as any).phoneVerified) smsTo.push((s as any).phoneNumber);
          }

          const emailHtml = `<p>A buyer has submitted a verification request.</p>
<ul>
  <li><strong>Buyer:</strong> ${email}</li>
  <li><strong>Requested tier:</strong> ${tier}</li>
  ${verificationNotes ? `<li><strong>Notes:</strong> ${verificationNotes}</li>` : ""}
</ul>
<p><a href="${SITE_URL}/seller/verifications">Review the request →</a></p>`;
          const emailText = `New verification request from ${email} for ${tier} tier.\nNotes: ${verificationNotes || "none"}\n\nReview: ${SITE_URL}/seller/verifications`;

          const tasks: Promise<any>[] = [];

          if (emailTo.length > 0) {
            tasks.push(
              sesClient.send(
                new SendEmailCommand({
                  Source: `Revolution Auction House <${FROM_EMAIL}>`,
                  Destination: { ToAddresses: emailTo },
                  Message: {
                    Subject: { Data: "New Buyer Verification Request" },
                    Body: {
                      Html: { Data: emailHtml },
                      Text: { Data: emailText },
                    },
                  },
                }),
              ),
            );
          }

          for (const phone of smsTo) {
            tasks.push(
              snsClient.send(
                new PublishCommand({
                  PhoneNumber: phone,
                  Message: `Revolution: New buyer verification request from ${email}. Review: ${SITE_URL}/seller/verifications`,
                }),
              ),
            );
          }

          await Promise.allSettled(tasks);
        } catch (notifyErr) {
          console.warn("NOTIFY_SELLERS_FAILED", notifyErr);
        }
      }

      return { success: true, message: "Verification request submitted" };
    } catch (err: any) {
      console.error("SUBMIT_VERIFICATION_REQUEST_ERROR", err);
      return { success: false, message: "Failed to submit request" };
    }
  };
