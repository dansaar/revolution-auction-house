import "@/lib/amplifyclient";

import { fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

export async function isAdminUser(): Promise<boolean> {
  try {
    const session = await fetchAuthSession();
    const groups =
      (session.tokens?.idToken?.payload["cognito:groups"] as string[]) || [];
    return groups.includes("Admin");
  } catch {
    return false;
  }
}

export async function isApprovedSeller(email?: string | null) {
  if (!email) return false;

  const normalizedEmail = email.toLowerCase();

  if (await isAdminUser()) return true;

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
