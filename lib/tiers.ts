export const BUYER_TIERS = [
  {
    code: "BASIC",
    name: "Basic",
    limit: 1_000,
    description: "Starting tier for all new buyers",
    requirements: [
      "Email verification",
      "Phone verification",
      "Payment method on file",
    ],
  },
  {
    code: "VERIFIED",
    name: "Verified",
    limit: 10_000,
    description: "ID-verified buyers",
    requirements: [
      "Government ID verification",
      "Verified billing address",
      "Fraud screening",
      "Payment method on file",
    ],
  },
  {
    code: "PREMIUM",
    name: "Premium",
    limit: 50_000,
    description: "Manually reviewed high-value buyers",
    requirements: [
      "ID verification",
      "Bank/payment verification",
      "Manual account review",
      "Payment method on file",
    ],
  },
  {
    code: "PRIVATE",
    name: "Private Client",
    limit: 250_000,
    description: "Concierge-level collector access",
    requirements: [
      "Proof of funds",
      "Private client approval",
      "Concierge contact",
      "Payment method on file",
    ],
  },
  {
    code: "TROPHY",
    name: "Trophy Bidder",
    limit: 5_000_000,
    description: "Unrestricted — signed agreement required",
    requirements: [
      "Proof of funds",
      "Signed bidder agreement",
      "Direct approval",
    ],
  },
] as const;

export type TierCode = (typeof BUYER_TIERS)[number]["code"];

export function getTier(code: string) {
  return BUYER_TIERS.find((t) => t.code === code) ?? BUYER_TIERS[0];
}

export function getTierLimit(code: string): number {
  return getTier(code).limit;
}

export function formatTierLimit(code: string): string {
  const limit = getTierLimit(code);
  if (limit >= 1_000_000) return `$${(limit / 1_000_000).toFixed(0)}M`;
  if (limit >= 1_000) return `$${(limit / 1_000).toFixed(0)}K`;
  return `$${limit.toLocaleString()}`;
}
