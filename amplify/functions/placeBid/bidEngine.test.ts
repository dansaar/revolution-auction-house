import { describe, it, expect } from "vitest";
import { defaultIncrement, getIncrement, resolveBid, type BidState } from "./bidEngine";

describe("defaultIncrement", () => {
  it("steps up the ladder at each boundary", () => {
    expect(defaultIncrement(50)).toBe(5);
    expect(defaultIncrement(99)).toBe(5);
    expect(defaultIncrement(100)).toBe(10);
    expect(defaultIncrement(499)).toBe(10);
    expect(defaultIncrement(500)).toBe(25);
    expect(defaultIncrement(1000)).toBe(50);
    expect(defaultIncrement(2500)).toBe(100);
    expect(defaultIncrement(5000)).toBe(250);
    expect(defaultIncrement(10000)).toBe(500);
    expect(defaultIncrement(25000)).toBe(1000);
    expect(defaultIncrement(50000)).toBe(2500);
    expect(defaultIncrement(100000)).toBe(5000);
    expect(defaultIncrement(250000)).toBe(10000);
    expect(defaultIncrement(500000)).toBe(25000);
    expect(defaultIncrement(9_999_999)).toBe(25000);
  });
});

describe("getIncrement", () => {
  it("uses the default when no custom value", () => {
    expect(getIncrement(1000)).toBe(50);
    expect(getIncrement(1000, null)).toBe(50);
  });
  it("uses a larger custom increment but never below the default", () => {
    expect(getIncrement(1000, 200)).toBe(200);
    expect(getIncrement(1000, 10)).toBe(50); // custom below floor → floor wins
  });
});

const empty: BidState = {
  currentPrice: 0,
  leaderUserId: "",
  leaderMaxBid: 0,
  secondUserId: "",
  secondMaxBid: 0,
};

describe("resolveBid", () => {
  it("first bid takes the lead at the minimum, hiding the max", () => {
    const r = resolveBid({ ...empty, currentPrice: 100 }, "B", 500, 105);
    expect(r.newLeaderUserId).toBe("B");
    expect(r.newLeaderMaxBid).toBe(500);
    expect(r.visiblePrice).toBe(105);
    expect(r.proxyUserId).toBe("");
  });

  it("leader raising their own max does not move the price", () => {
    const state: BidState = { currentPrice: 500, leaderUserId: "L", leaderMaxBid: 1000, secondUserId: "", secondMaxBid: 0 };
    const r = resolveBid(state, "L", 1500, 525);
    expect(r.newLeaderUserId).toBe("L");
    expect(r.newLeaderMaxBid).toBe(1500);
    expect(r.visiblePrice).toBe(500);
    expect(r.proxyUserId).toBe("");
  });

  it("a higher max takes the lead, one increment above the old leader's max", () => {
    const state: BidState = { currentPrice: 500, leaderUserId: "L", leaderMaxBid: 1000, secondUserId: "", secondMaxBid: 0 };
    const r = resolveBid(state, "B", 2000, 525);
    expect(r.newLeaderUserId).toBe("B");
    expect(r.newLeaderMaxBid).toBe(2000);
    expect(r.newSecondUserId).toBe("L");
    expect(r.newSecondMaxBid).toBe(1000);
    // increment at 1000 is 50 → 1000 + 50 = 1050, capped by the new max
    expect(r.visiblePrice).toBe(1050);
    expect(r.proxyUserId).toBe("");
  });

  it("caps the visible price at the new bidder's max when the step would exceed it", () => {
    const state: BidState = { currentPrice: 500, leaderUserId: "L", leaderMaxBid: 1000, secondUserId: "", secondMaxBid: 0 };
    const r = resolveBid(state, "B", 1020, 525); // 1000+50=1050 > 1020 → capped at 1020
    expect(r.newLeaderUserId).toBe("B");
    expect(r.visiblePrice).toBe(1020);
  });

  it("a bid below the leader's max loses; leader's proxy bumps the price", () => {
    const state: BidState = { currentPrice: 1050, leaderUserId: "L", leaderMaxBid: 2000, secondUserId: "", secondMaxBid: 0 };
    const r = resolveBid(state, "B", 1500, 1075);
    expect(r.newLeaderUserId).toBe("L"); // unchanged
    expect(r.newSecondUserId).toBe("B");
    expect(r.newSecondMaxBid).toBe(1500);
    // increment at 1500 is 50 → 1500 + 50 = 1550, capped by leader max 2000
    expect(r.visiblePrice).toBe(1550);
    expect(r.proxyUserId).toBe("L");
  });

  it("a tie keeps the earlier leader at the tied amount", () => {
    const state: BidState = { currentPrice: 1550, leaderUserId: "L", leaderMaxBid: 2000, secondUserId: "", secondMaxBid: 0 };
    const r = resolveBid(state, "B", 2000, 1575);
    expect(r.newLeaderUserId).toBe("L");
    expect(r.newSecondUserId).toBe("B");
    expect(r.newSecondMaxBid).toBe(2000);
    expect(r.visiblePrice).toBe(2000);
    expect(r.proxyUserId).toBe("L");
  });

  it("honors a seller's custom increment", () => {
    const state: BidState = { currentPrice: 500, leaderUserId: "L", leaderMaxBid: 1000, secondUserId: "", secondMaxBid: 0 };
    const r = resolveBid(state, "B", 5000, 525, 500); // custom 500 > default 50
    expect(r.visiblePrice).toBe(1500); // 1000 + 500
  });

  // ── Reserve-aware proxy ──
  it("lone bidder whose max covers the reserve jumps the price to the reserve", () => {
    const r = resolveBid({ ...empty, currentPrice: 10 }, "B", 1200, 15, null, 1000);
    expect(r.newLeaderUserId).toBe("B");
    expect(r.visiblePrice).toBe(1000); // jumps to reserve instead of staying at 15
  });

  it("lone bidder whose max is below the reserve does not move to the reserve", () => {
    const r = resolveBid({ ...empty, currentPrice: 10 }, "B", 15, 15, null, 1000);
    expect(r.visiblePrice).toBe(15); // reserve stays unmet
  });

  it("never pushes the visible price above the leader's max to reach the reserve", () => {
    const r = resolveBid({ ...empty, currentPrice: 10 }, "B", 1000, 15, null, 1000);
    expect(r.visiblePrice).toBe(1000); // exactly the reserve, == max
  });

  it("keeps the higher of the normal proxy price and the reserve", () => {
    const state: BidState = { currentPrice: 500, leaderUserId: "L", leaderMaxBid: 1000, secondUserId: "", secondMaxBid: 0 };
    const r = resolveBid(state, "B", 2000, 525, null, 800); // proxy → 1050, reserve 800
    expect(r.visiblePrice).toBe(1050); // proxy price already above reserve
  });
});
