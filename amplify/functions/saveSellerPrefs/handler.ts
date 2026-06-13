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
  const groups: string[] = claims["cognito:groups"] ?? [];
  const isSeller = groups.includes("Seller");
  const isAdmin = groups.includes("Admin");

  if (!isSeller && !isAdmin) {
    return { success: false };
  }

  const callerEmail = String(claims.email || "").toLowerCase();
  if (!callerEmail) {
    return { success: false };
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

  return { success: true };
};
