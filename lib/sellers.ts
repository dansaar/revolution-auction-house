import "@/lib/amplifyclient";

import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

const EMERGENCY_SELLERS = ["dansaar52@gmail.com"];

export async function isApprovedSeller(email?: string | null) {
  if (!email) return false;

  const normalizedEmail = email.toLowerCase();

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
