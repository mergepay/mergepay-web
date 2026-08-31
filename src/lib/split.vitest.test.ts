/**
 * Vitest tests for the split helpers in src/lib/split.ts.
 * (The node:test suite already lives at __tests__/split.test.ts.)
 */

import { describe, it, expect } from "vitest";
import {
  splitEqual,
  splitByPercentage,
  splitByCustom,
  computeSharesAmounts,
  toStroops,
  fromStroops,
  STROOPS_PER_UNIT,
} from "./split";

/** Sum a split result in stroops so we can compare against the exact total. */
function sumStroops(result: Array<{ userId: string; amount: string }>): bigint {
  return result.reduce((sum, entry) => sum + toStroops(entry.amount), BigInt(0));
}

describe("splitEqual", () => {
  it("splits an amount evenly across three participants with an exact sum", () => {
    const result = splitEqual("10.00", ["user-1", "user-2", "user-3"]);
    expect(result).toHaveLength(3);
    expect(sumStroops(result)).toBe(toStroops("10.00"));
  });

  it("distributes the remainder deterministically (first member gets the extra stroop)", () => {
    // 10 XLM = 100_000_000 stroops; floor(100M/3) = 33_333_333 each, the
    // single leftover stroop goes to the lowest index.
    const result = splitEqual("10.00", ["a", "b", "c"]);
    expect(result[0].amount).toBe("3.3333334");
    expect(result[1].amount).toBe("3.3333333");
    expect(result[2].amount).toBe("3.3333333");
  });

  it("keeps every share within one stroop of the exact quotient", () => {
    const total = toStroops("100.00");
    const result = splitEqual("100.00", ["a", "b", "c"]);
    const min = 1000000000n / 3n; // floor(total / participants)
    for (const entry of result) {
      const s = toStroops(entry.amount);
      expect(s).toBeGreaterThanOrEqual(min);
      expect(s).toBeLessThanOrEqual(min + 1n);
    }
    expect(sumStroops(result)).toBe(total);
  });

  it("gives a single participant the full amount", () => {
    expect(splitEqual("42.50", ["only"])).toEqual([
      { userId: "only", amount: "42.5000000" },
    ]);
  });

  it("handles a large realistic total without precision loss (1B XLM)", () => {
    const result = splitEqual("1000000000", ["a", "b", "c"]);
    expect(sumStroops(result)).toBe(toStroops("1000000000"));
    // 1e16 stroops / 3 = 3_333_333_333_333_333 with remainder 1.
    expect(result[0].amount).toBe("333333333.3333334");
    expect(result[1].amount).toBe("333333333.3333333");
    expect(result[2].amount).toBe("333333333.3333333");
  });

  it("returns zeros for a zero total without throwing", () => {
    expect(splitEqual("0.00", ["a", "b"])).toEqual([
      { userId: "a", amount: "0.0000000" },
      { userId: "b", amount: "0.0000000" },
    ]);
  });
});

describe("splitByPercentage", () => {
  it("allocates 100% across members with an exact sum", () => {
    const result = splitByPercentage("100.00", [
      { userId: "u1", percent: 25 },
      { userId: "u2", percent: 25 },
      { userId: "u3", percent: 50 },
    ]);
    expect(sumStroops(result)).toBe(toStroops("100.00"));
    expect(result.map((r) => r.amount)).toEqual([
      "25.0000000",
      "25.0000000",
      "50.0000000",
    ]);
  });

  it("handles percentage remainders with Hamilton's method", () => {
    // 33.33 + 33.33 + 33.34 of 100 → [33, 33, 34]
    const result = splitByPercentage("100.00", [
      { userId: "u1", percent: 33.33 },
      { userId: "u2", percent: 33.33 },
      { userId: "u3", percent: 33.34 },
    ]);
    expect(sumStroops(result)).toBe(toStroops("100.00"));
    expect(result.map((r) => r.amount)).toEqual([
      "33.3300000",
      "33.3300000",
      "33.3400000",
    ]);
  });

  it("gives zero to a zero-balance participant without throwing", () => {
    const result = splitByPercentage("100.00", [
      { userId: "u1", percent: 100 },
      { userId: "u2", percent: 0 },
    ]);
    expect(result).toEqual([
      { userId: "u1", amount: "100.0000000" },
      { userId: "u2", amount: "0.0000000" },
    ]);
  });

  it("allocates nothing for a zero total", () => {
    const result = splitByPercentage("0.00", [
      { userId: "u1", percent: 50 },
      { userId: "u2", percent: 50 },
    ]);
    expect(sumStroops(result)).toBe(0n);
  });
});

describe("splitByCustom", () => {
  it("preserves custom amounts exactly, with 7-decimal precision", () => {
    const result = splitByCustom("10.00", [
      { userId: "u1", amount: "2.0000000" },
      { userId: "u2", amount: "3.0000000" },
      { userId: "u3", amount: "5.0000000" },
    ]);
    expect(result).toEqual([
      { userId: "u1", amount: "2.0000000" },
      { userId: "u2", amount: "3.0000000" },
      { userId: "u3", amount: "5.0000000" },
    ]);
  });

  it("handles fractional custom amounts without precision drift", () => {
    const result = splitByCustom("1.50", [
      { userId: "u1", amount: "0.5000001" },
      { userId: "u2", amount: "0.9999999" },
    ]);
    expect(sumStroops(result)).toBe(toStroops("1.5000000"));
  });

  it("returns zero amounts for a zero-balance participant", () => {
    const result = splitByCustom("5.00", [
      { userId: "u1", amount: "0.0000000" },
      { userId: "u2", amount: "5.0000000" },
    ]);
    expect(result[0].amount).toBe("0.0000000");
  });
});

describe("computeSharesAmounts edge cases", () => {
  it("empty weights produce an empty allocation", () => {
    expect(computeSharesAmounts(100n, [])).toEqual([]);
  });

  it("zero total with several weights returns all zeros", () => {
    expect(computeSharesAmounts(0n, [1, 2, 3])).toEqual([0n, 0n, 0n]);
  });

  it("exact weighted shares leave no remainder", () => {
    const total = 15_000_000n;
    const out = computeSharesAmounts(total, [0.5, 0.5, 0.5]);
    expect(out.reduce((s, x) => s + x, 0n)).toBe(total);
    expect(out).toEqual([5_000_000n, 5_000_000n, 5_000_000n]);
  });

  it("round-trips stroops through fromStroops/toStroops", () => {
    for (const s of [100_000_000n, 1n, 99_999_999n, 12_345_678n]) {
      expect(toStroops(fromStroops(s))).toBe(s);
    }
    expect(fromStroops(STROOPS_PER_UNIT)).toBe("1.0000000");
  });

  it("throws on invalid inputs instead of silently mis-splitting", () => {
    expect(() => computeSharesAmounts(100n, [1, -1])).toThrow(/non-negative/i);
    expect(() => computeSharesAmounts(100n, [0, 0])).toThrow(/positive/i);
    expect(() => computeSharesAmounts(-1n, [1])).toThrow(/non-negative/i);
  });
});
