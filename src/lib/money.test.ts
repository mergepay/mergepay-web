import { describe, it, expect } from "vitest";
import {
  parseAmount,
  validateAmount,
  normalizeAmount,
  toStroops,
  exceedsBalance,
  MAX_DECIMAL_PLACES,
} from "./money";

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------
describe("parseAmount", () => {
  it("returns a plain decimal string for a normal positive amount", () => {
    expect(parseAmount("1.5")).toBe("1.5");
  });

  it("converts exponential notation to plain decimal", () => {
    expect(parseAmount("1e-7")).toBe("0.0000001");
  });

  it("converts large exponential notation to plain decimal", () => {
    expect(parseAmount("1e7")).toBe("10000000");
  });

  it("returns null for zero", () => {
    expect(parseAmount("0")).toBeNull();
  });

  it("returns null for negative values", () => {
    expect(parseAmount("-1")).toBeNull();
  });

  it("returns null for non-numeric strings", () => {
    expect(parseAmount("abc")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAmount("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseAmount("   ")).toBeNull();
  });

  it("handles whitespace-padded valid input", () => {
    expect(parseAmount(" 2.5 ")).toBe("2.5");
  });

  it("trims trailing zeros after decimal", () => {
    // toFixed(20) then strip → should give "1.5" not "1.50000...0"
    const result = parseAmount("1.50");
    expect(result).toBe("1.5");
  });

  it("handles whole numbers without decimal", () => {
    expect(parseAmount("100")).toBe("100");
  });
});

// ---------------------------------------------------------------------------
// validateAmount
// ---------------------------------------------------------------------------
describe("validateAmount", () => {
  it("returns null for a valid 7dp amount", () => {
    expect(validateAmount("0.0000001")).toBeNull();
  });

  it("returns null for a valid whole number", () => {
    expect(validateAmount("42")).toBeNull();
  });

  it("returns null for exponential notation that resolves within 7dp", () => {
    // 1e-7 = 0.0000001 → valid
    expect(validateAmount("1e-7")).toBeNull();
  });

  it("returns an error for zero", () => {
    expect(validateAmount("0")).not.toBeNull();
  });

  it("returns an error for a negative value", () => {
    expect(validateAmount("-5")).not.toBeNull();
  });

  it("returns an error for empty string", () => {
    expect(validateAmount("")).not.toBeNull();
  });

  it("returns an error for non-numeric input", () => {
    expect(validateAmount("abc")).not.toBeNull();
  });

  it("returns an error for more than 7 decimal places", () => {
    expect(validateAmount("0.00000001")).not.toBeNull();
  });

  it("mentions the decimal place limit in the error message", () => {
    const err = validateAmount("0.00000001");
    expect(err).toContain(`${MAX_DECIMAL_PLACES}`);
  });
});

// ---------------------------------------------------------------------------
// normalizeAmount
// ---------------------------------------------------------------------------
describe("normalizeAmount", () => {
  it("returns plain decimal for normal input", () => {
    expect(normalizeAmount("1.5")).toBe("1.5");
  });

  it("converts exponential notation to plain decimal", () => {
    expect(normalizeAmount("1e-7")).toBe("0.0000001");
  });

  it("throws for zero", () => {
    expect(() => normalizeAmount("0")).toThrow();
  });

  it("throws for invalid input", () => {
    expect(() => normalizeAmount("bad")).toThrow();
  });

  it("throws for >7 decimal places", () => {
    expect(() => normalizeAmount("0.00000001")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// toStroops
// ---------------------------------------------------------------------------
describe("toStroops", () => {
  it("converts 1 to 10_000_000 stroops", () => {
    expect(toStroops("1")).toBe(BigInt(10_000_000));
  });

  it("converts 0.0000001 to 1 stroop", () => {
    expect(toStroops("0.0000001")).toBe(BigInt(1));
  });

  it("converts 1.5 to 15_000_000 stroops", () => {
    expect(toStroops("1.5")).toBe(BigInt(15_000_000));
  });

  it("converts exponential form 1e-7 to 1 stroop", () => {
    expect(toStroops("1e-7")).toBe(BigInt(1));
  });

  it("throws for invalid amounts", () => {
    expect(() => toStroops("0")).toThrow();
    expect(() => toStroops("abc")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// exceedsBalance
// ---------------------------------------------------------------------------
describe("exceedsBalance", () => {
  it("returns false when amount equals balance", () => {
    expect(exceedsBalance("1.5", "1.5")).toBe(false);
  });

  it("returns false when amount is less than balance", () => {
    expect(exceedsBalance("1.0", "2.0")).toBe(false);
  });

  it("returns true when amount exceeds balance", () => {
    expect(exceedsBalance("2.0", "1.5")).toBe(true);
  });

  it("returns true when amount exceeds balance by a single stroop", () => {
    expect(exceedsBalance("1.0000001", "1.0000000")).toBe(true);
  });

  it("returns false when within balance by a single stroop", () => {
    expect(exceedsBalance("0.9999999", "1.0000000")).toBe(false);
  });

  it("returns true when balance is zero / unparseable (fail-safe)", () => {
    // balance = "0" → parseAmount returns null → exceedsBalance returns true
    expect(exceedsBalance("1.0", "0")).toBe(true);
  });

  it("handles exponential-notation inputs correctly", () => {
    // 1e-7 = 0.0000001; balance 0.0000002 → should NOT exceed
    expect(exceedsBalance("1e-7", "0.0000002")).toBe(false);
    // 3e-7 vs 0.0000002 → should exceed
    expect(exceedsBalance("3e-7", "0.0000002")).toBe(true);
  });
});
