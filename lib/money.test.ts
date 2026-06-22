import { describe, it, expect } from "vitest";
import { moneyToNumber, formatMoney } from "./money";

describe("moneyToNumber", () => {
  it("passes numbers through", () => {
    expect(moneyToNumber(1234)).toBe(1234);
    expect(moneyToNumber(0)).toBe(0);
  });

  it("returns 0 for nullish/empty", () => {
    expect(moneyToNumber(null)).toBe(0);
    expect(moneyToNumber(undefined)).toBe(0);
    expect(moneyToNumber("")).toBe(0);
  });

  it("strips $ and commas", () => {
    expect(moneyToNumber("$1,234")).toBe(1234);
    expect(moneyToNumber("$1,000,000")).toBe(1000000);
    expect(moneyToNumber("250")).toBe(250);
  });
});

describe("formatMoney", () => {
  it("adds $ and thousands separators", () => {
    expect(formatMoney(1234)).toBe("$1,234");
    expect(formatMoney(1000000)).toBe("$1,000,000");
    expect(formatMoney(0)).toBe("$0");
  });

  it("round-trips with moneyToNumber", () => {
    for (const n of [5, 250, 12345, 1000000, 25000000]) {
      expect(moneyToNumber(formatMoney(n))).toBe(n);
    }
  });
});
