import type { Schema } from "../../data/resource";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/saveSellerPrefs";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

export const handler: Schema["saveSellerPrefs"]["functionHandler"] = async (
  event,
) => {
  const { notifyVerifications, notifyOffers, phoneNumber } = event.arguments;

  const identity = event.identity as any;
  const claims = identity?.claims ?? {};

  const rawGroups = claims["cognito:groups"];
  const groups: string[] = Array.isArray(rawGroups)
    ? rawGroups
    : typeof rawGroups === "string"
      ? rawGroups.split(",").map((s: string) => s.trim())
      : [];

  const isAdmin = groups.includes("Admin");

  const callerEmail = String(claims.email || "").toLowerCase();
  console.log("saveSellerPrefs: callerEmail", callerEmail, "isAdmin", isAdmin, "groups", groups);

  if (!callerEmail) {
    console.warn("saveSellerPrefs: missing email claim");
    return { success: false };
  }

  // Verify caller is an approved seller (same pattern as reviewBuyerVerification)
  if (!isAdmin) {
    const sellerResult = await client.models.SellerProfile.get(
      { email: callerEmail },
      { authMode: "iam" } as any,
    );
    if (!sellerResult.data || sellerResult.data.status !== "APPROVED") {
      console.warn("saveSellerPrefs: no approved SellerProfile for", callerEmail);
      return { success: false };
    }
  }

  const VALID_PREFS = ["email", "sms", "both", "none"];
  const safeVerif = VALID_PREFS.includes(notifyVerifications ?? "") ? notifyVerifications! : "email";
  const safeOffers = VALID_PREFS.includes(notifyOffers ?? "") ? notifyOffers! : "email";
  const safePhone = phoneNumber ? phoneNumber.trim() : null;

  await client.models.SellerProfile.update(
    {
      email: callerEmail,
      notifyVerifications: safeVerif,
      notifyOffers: safeOffers,
      phoneNumber: safePhone,
    },
    { authMode: "iam" } as any,
  );

  console.log("saveSellerPrefs: updated", { callerEmail, safeVerif, safeOffers });
  return { success: true };
};
