import { describe, it, expect } from "vitest";
import {
  getTier,
  getTierLimit,
  formatTierLimit,
  privateBandLabel,
  tierLimitDisplay,
  PRIVATE_MIN,
  PRIVATE_MAX,
  TROPHY_MIN,
  TROPHY_MAX,
} from "./tiers";

describe("getTier", () => {
  it("resolves known tiers", () => {
    expect(getTier("PRIVATE").name).toBe("Private Client");
    expect(getTier("TROPHY").name).toBe("Trophy Bidder");
  });
  it("falls back to the first tier (BASIC) for unknown codes", () => {
    expect(getTier("NOPE").code).toBe("BASIC");
  });
});

describe("getTierLimit", () => {
  it("returns the configured numeric limit", () => {
    expect(getTierLimit("BASIC")).toBe(1_000);
    expect(getTierLimit("VERIFIED")).toBe(10_000);
    expect(getTierLimit("PRIVATE")).toBe(1_000_000);
  });
});

describe("formatTierLimit", () => {
  it("formats fixed tiers", () => {
    expect(formatTierLimit("BASIC")).toBe("$1K");
    expect(formatTierLimit("VERIFIED")).toBe("$10K");
    expect(formatTierLimit("PRIVATE")).toBe("$1M");
  });
  it("shows Trophy as reviewer-set, not a fixed ceiling", () => {
    expect(formatTierLimit("TROPHY")).toBe("Above $1M");
  });
});

describe("privateBandLabel", () => {
  it("buckets by band with inclusive upper bounds", () => {
    expect(privateBandLabel(10_000)).toBe("$10K–$100K");
    expect(privateBandLabel(100_000)).toBe("$10K–$100K");
    expect(privateBandLabel(100_001)).toBe("$100K–$500K");
    expect(privateBandLabel(500_000)).toBe("$100K–$500K");
    expect(privateBandLabel(500_001)).toBe("$500K–$1M");
    expect(privateBandLabel(1_000_000)).toBe("$500K–$1M");
  });
});

describe("tierLimitDisplay", () => {
  it("shows Private band + exact limit when a bidLimit is set", () => {
    expect(tierLimitDisplay("PRIVATE", 400_000)).toBe(
      "Private Client · $100K–$500K (limit $400,000)",
    );
  });
  it("shows Trophy's custom ceiling, or a generic above-$1M label", () => {
    expect(tierLimitDisplay("TROPHY", 25_000_000)).toBe(
      "Trophy Bidder · up to $25,000,000 (wire/escrow)",
    );
    expect(tierLimitDisplay("TROPHY", null)).toBe(
      "Trophy Bidder · Above $1M (wire/escrow)",
    );
  });
  it("falls back to name + formatted limit for fixed tiers", () => {
    expect(tierLimitDisplay("VERIFIED", null)).toBe("Verified · $10K");
  });
});

describe("tier range constants", () => {
  it("are the agreed Private / Trophy bounds", () => {
    expect(PRIVATE_MIN).toBe(10_000);
    expect(PRIVATE_MAX).toBe(1_000_000);
    expect(TROPHY_MIN).toBe(1_000_000);
    expect(TROPHY_MAX).toBe(100_000_000);
  });
});
