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
    code: "PRIVATE",
    name: "Private Client",
    limit: 1_000_000,
    description: "Concierge access — limit set per buyer from $10K to $1M",
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
    description: "Above $1M — settled by wire/escrow, signed agreement required",
    requirements: [
      "Proof of funds",
      "Signed bidder agreement",
      "Direct approval",
    ],
  },
] as const;

// Private Client is approved at an exact dollar limit ($10K–$1M); the UI shows
// which band that limit falls in.
export const PRIVATE_MIN = 10_000;
export const PRIVATE_MAX = 1_000_000;

// Trophy is also approved at an exact limit, but above $1M (settled by
// wire/escrow). The reviewer sets the exact ceiling.
export const TROPHY_MIN = 1_000_000;
export const TROPHY_MAX = 100_000_000;

export function privateBandLabel(limit: number): string {
  if (limit <= 100_000) return "$10K–$100K";
  if (limit <= 500_000) return "$100K–$500K";
  return "$500K–$1M";
}

// Human label for a buyer's tier + approved limit (Private/Trophy show their
// reviewer-set exact ceiling).
export function tierLimitDisplay(tier: string, bidLimit?: number | null): string {
  if (tier === "PRIVATE" && bidLimit) {
    return `Private Client · ${privateBandLabel(bidLimit)} (limit $${bidLimit.toLocaleString()})`;
  }
  if (tier === "TROPHY") {
    return bidLimit
      ? `Trophy Bidder · up to $${bidLimit.toLocaleString()} (wire/escrow)`
      : `Trophy Bidder · Above $1M (wire/escrow)`;
  }
  return `${getTier(tier).name} · ${formatTierLimit(tier)}`;
}

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
