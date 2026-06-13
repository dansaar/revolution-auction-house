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
  const { notifyVerifications, notifyOffers, phoneNumber, shipFromName, shipFromStreet1, shipFromStreet2, shipFromCity, shipFromState, shipFromZip, shipFromPhone } = event.arguments;

  const identity = event.identity as any;
  const claims = identity?.claims ?? {};

  const rawGroups = claims["cognito:groups"];
  const groups: string[] = Array.isArray(rawGroups)
    ? rawGroups
    : typeof rawGroups === "string"
      ? rawGroups.split(",").map((s: string) => s.trim())
      : [];

  const isAdmin = groups.includes("Admin");

  // Access tokens don't include email — look it up from BuyerProfile by sub
  const callerSub = String(identity?.sub || claims.sub || "");
  console.log("saveSellerPrefs: sub", callerSub, "isAdmin", isAdmin);

  if (!callerSub) {
    console.warn("saveSellerPrefs: missing sub");
    return { success: false };
  }

  const buyerResult = await client.models.BuyerProfile.get(
    { userId: callerSub },
    { authMode: "iam" } as any,
  );
  const callerEmail = (buyerResult.data?.email || "").toLowerCase();
  console.log("saveSellerPrefs: callerEmail from BuyerProfile", callerEmail);

  if (!callerEmail) {
    console.warn("saveSellerPrefs: no BuyerProfile found for sub", callerSub);
    return { success: false };
  }

  // Verify caller is an approved seller (admins skip this check)
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
      ...(shipFromName !== undefined ? { shipFromName: shipFromName?.trim() || null } : {}),
      ...(shipFromStreet1 !== undefined ? { shipFromStreet1: shipFromStreet1?.trim() || null } : {}),
      ...(shipFromStreet2 !== undefined ? { shipFromStreet2: shipFromStreet2?.trim() || null } : {}),
      ...(shipFromCity !== undefined ? { shipFromCity: shipFromCity?.trim() || null } : {}),
      ...(shipFromState !== undefined ? { shipFromState: shipFromState?.trim() || null } : {}),
      ...(shipFromZip !== undefined ? { shipFromZip: shipFromZip?.trim() || null } : {}),
      ...(shipFromPhone !== undefined ? { shipFromPhone: shipFromPhone?.trim() || null } : {}),
    },
    { authMode: "iam" } as any,
  );

  console.log("saveSellerPrefs: updated", { callerEmail, safeVerif, safeOffers });
  return { success: true };
};
