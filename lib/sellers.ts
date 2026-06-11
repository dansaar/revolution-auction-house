import "@/lib/amplifyclient";

import { fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import outputs from "@/amplify_outputs.json";

const client = generateClient<Schema>();

// Raw GraphQL fetch — bypasses Amplify client's auto-owner filters.
// Use for admin operations where group auth should allow full access.
export async function adminGraphQL(query: string, variables?: Record<string, any>) {
  const session = await fetchAuthSession({ forceRefresh: false });
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch((outputs as any).data.url as string, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export async function adminFetchAllInvoices(): Promise<any[]> {
  const fields = `id type auctionId listingId title buyerEmail sellerEmail
    subtotal buyerPremium tax amount status stripeSessionId paidAt
    shippingName shippingLine1 shippingLine2 shippingCity shippingState shippingZip shippingCountry`;

  const all: any[] = [];
  let nextToken: string | null = null;

  do {
    const result: any = await adminGraphQL(
      `query ListInvoices($limit: Int, $nextToken: String) {
        listInvoices(limit: $limit, nextToken: $nextToken) {
          items { ${fields} }
          nextToken
        }
      }`,
      { limit: 1000, nextToken },
    );
    const page = result?.data?.listInvoices;
    all.push(...(page?.items || []));
    nextToken = page?.nextToken ?? null;
  } while (nextToken);

  return all;
}

export async function isAdminUser(): Promise<boolean> {
  try {
    const session = await fetchAuthSession({ forceRefresh: false });
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
