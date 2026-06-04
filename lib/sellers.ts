import "@/lib/amplifyclient";

import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

export const PLATFORM_ADMINS = ["dansaar52@gmail.com", "dansaar@verizon.net"];

const EMERGENCY_SELLERS = ["dansaar52@gmail.com"];

export function isPlatformAdmin(email?: string | null) {
  if (!email) return false;

  return PLATFORM_ADMINS.map((admin) => admin.toLowerCase()).includes(
    email.toLowerCase(),
  );
}

export async function isApprovedSeller(email?: string | null) {
  if (!email) return false;

  const normalizedEmail = email.toLowerCase();

  if (isPlatformAdmin(normalizedEmail)) {
    return true;
  }

  if (
    EMERGENCY_SELLERS.map((seller) => seller.toLowerCase()).includes(
      normalizedEmail,
    )
  ) {
    return true;
  }

  try {
    const result = await client.models.SellerProfile.get(
      { email: normalizedEmail },
      { authMode: "userPool" } as any,
    );

    return result.data?.status === "APPROVED";
  } catch (err) {
    console.error("SELLER CHECK ERROR", err);
    return false;
  }
}