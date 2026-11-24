import { describe, expect, it } from "vitest";

import { expenseSplitSchema } from "../expenseValidation";
import { expenseFormSchema } from "./expense";
import {
  MAX_AMOUNT_STROOPS,
  checkSplitPercent,
  checkStellarAmount,
  countDecimalPlaces,
  hasControlCharacters,
  sanitizeText,
} from "./sanitize";

/**
 * Input sanitization and validation for expense splitting forms (#884).
 * Covers the shared primitives and both schemas built on them: the
 * react-hook-form schema (`expenseFormSchema`) and the API-bound split
 * schema (`expenseSplitSchema`).
 */

const baseForm = {
  title: "Groceries",
  amount: "90",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal" as const,
  shares: [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
  payerUserId: "a",
  memo: null,
  receiptUrl: null,
};

function formMessages(overrides: Record<string, unknown>): string[] {
  const result = expenseFormSchema.safeParse({ ...baseForm, ...overrides });
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("sanitizeText", () => {
  it("strips bidi overrides and zero-width characters that spoof or split text", () => {
    expect(sanitizeText("Rent ‮gnp.exe")).toBe("Rent gnp.exe");
    expect(sanitizeText("Din​ner")).toBe("Dinner");
    expect(sanitizeText("﻿Lunch")).toBe("Lunch");
    expect(sanitizeText("a⁦b⁩c")).toBe("abc");
  });

  it("collapses whitespace runs and trims", () => {
    expect(sanitizeText("  Team   dinner   out  ")).toBe("Team dinner out");
  });

  it("normalises to NFC so visually identical titles compare equal", () => {
    expect(sanitizeText("Café")).toBe("Café");
  });

  it("is idempotent", () => {
    const raw = "  ‮x​  y  ";
    expect(sanitizeText(sanitizeText(raw))).toBe(sanitizeText(raw));
  });

  it("detects control characters", () => {
    expect(hasControlCharacters("ok")).toBe(false);
    expect(hasControlCharacters("bad\u0000")).toBe(true);
    expect(hasControlCharacters("bad\u007f")).toBe(true);
  });
});

describe("checkStellarAmount", () => {
  it("accepts positive amounts with up to 7 decimal places", () => {
    expect(checkStellarAmount("1")).toEqual({ ok: true, stroops: 10_000_000n });
    expect(checkStellarAmount("0.0000001")).toEqual({ ok: true, stroops: 1n });
    expect(checkStellarAmount(" 12.5 ")).toEqual({ ok: true, stroops: 125_000_000n });
  });

  it.each([
    ["", "required"],
    ["   ", "required"],
    ["-5", "not_a_number"],
    ["+5", "not_a_number"],
    ["1e3", "not_a_number"],
    ["1,000", "not_a_number"],
    [".5", "not_a_number"],
    ["5.", "not_a_number"],
    ["Infinity", "not_a_number"],
    ["NaN", "not_a_number"],
    ["12abc", "not_a_number"],
    ["0x10", "not_a_number"],
    ["1.12345678", "too_precise"],
    ["0", "not_positive"],
    ["0.0000000", "not_positive"],
    ["922337203685.4775808", "too_large"],
  ])("rejects %j as %s", (input, issue) => {
    expect(checkStellarAmount(input)).toEqual({ ok: false, issue });
  });

  it("accepts the exact int64 stroop ceiling", () => {
    const result = checkStellarAmount("922337203685.4775807");
    expect(result).toEqual({ ok: true, stroops: MAX_AMOUNT_STROOPS });
  });

  it("counts decimal places", () => {
    expect(countDecimalPlaces("10")).toBe(0);
    expect(countDecimalPlaces("10.1234567")).toBe(7);
  });
});

describe("checkSplitPercent", () => {
  it("accepts ratios above 0 up to 100 with at most 2 decimals", () => {
    expect(checkSplitPercent(0.01)).toBeNull();
    expect(checkSplitPercent(33.33)).toBeNull();
    expect(checkSplitPercent(100)).toBeNull();
  });

  it("rejects malformed split ratios", () => {
    expect(checkSplitPercent(undefined)).toBe("required");
    expect(checkSplitPercent(Number.NaN)).toBe("required");
    expect(checkSplitPercent(Number.POSITIVE_INFINITY)).toBe("not_finite");
    expect(checkSplitPercent(0)).toBe("out_of_range");
    expect(checkSplitPercent(-10)).toBe("out_of_range");
    expect(checkSplitPercent(100.01)).toBe("out_of_range");
    expect(checkSplitPercent(33.333)).toBe("too_precise");
  });
});

describe("expenseFormSchema sanitization", () => {
  it("returns a sanitized title", () => {
    const result = expenseFormSchema.safeParse({ ...baseForm, title: "  Team ‮dinner​  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Team dinner");
  });

  it("treats a title of only invisible characters as missing", () => {
    expect(formMessages({ title: "​​" })).toContain("Title is required");
  });

  it("rejects control characters in the title", () => {
    expect(formMessages({ title: "Rent\u0007" })).toContain("Title must not contain control characters");
  });

  it("measures the title length after sanitization", () => {
    // 80 visible characters padded with zero-width spaces still fits.
    const padded = `${"A".repeat(80)}${"​".repeat(10)}`;
    expect(expenseFormSchema.safeParse({ ...baseForm, title: padded }).success).toBe(true);
  });

  it("sanitizes the description", () => {
    const result = expenseFormSchema.safeParse({ ...baseForm, description: "Split   ‮with​ flatmates" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe("Split with flatmates");
  });

  it("trims pasted whitespace around the amount", () => {
    const result = expenseFormSchema.safeParse({ ...baseForm, amount: " 90.5 " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amount).toBe("90.5");
  });
});

describe("expenseFormSchema invalid currency inputs", () => {
  it.each(["-10", "1e2", "10.12345678", "0", "abc", "1,000", "Infinity"])("rejects amount %j", (amount) => {
    expect(expenseFormSchema.safeParse({ ...baseForm, amount }).success).toBe(false);
  });

  it("names the 7-decimal limit in the inline message", () => {
    expect(formMessages({ amount: "10.12345678" }).join(" ")).toMatch(/at most 7 decimal places/);
  });

  it("rejects a custom share with more than 7 decimals", () => {
    const messages = formMessages({
      splitType: "custom",
      amount: "10",
      shares: [
        { userId: "a", amount: "5.00000001" },
        { userId: "b", amount: "4.99999999" },
      ],
    });
    expect(messages).toContain("Amount must have at most 7 decimal places");
  });

  it("rejects negative and zero custom shares", () => {
    expect(
      formMessages({
        splitType: "custom",
        amount: "10",
        shares: [
          { userId: "a", amount: "-5" },
          { userId: "b", amount: "15" },
        ],
      })
    ).toContain("Amount must be a plain number");
    expect(
      formMessages({
        splitType: "custom",
        amount: "10",
        shares: [
          { userId: "a", amount: "0" },
          { userId: "b", amount: "10" },
        ],
      })
    ).toContain("Share amount must be greater than zero");
  });
});

describe("expenseFormSchema malformed split ratios", () => {
  function percentMessages(percents: number[]): string[] {
    return formMessages({
      splitType: "percentage",
      shares: percents.map((percent, i) => ({ userId: `u${i}`, percent })),
    });
  }

  it("accepts ratios that total exactly 100", () => {
    expect(percentMessages([33.33, 33.33, 33.34])).toEqual([]);
  });

  it("rejects a 0% participant even when the rest total 100", () => {
    expect(percentMessages([0, 50, 50])).toContain("Percentage must be greater than 0 and at most 100");
  });

  it("rejects NaN, Infinity and negative ratios", () => {
    // NaN is already refused by z.number() itself, before the split rules run.
    expect(percentMessages([Number.NaN, 100]).length).toBeGreaterThan(0);
    expect(percentMessages([Number.POSITIVE_INFINITY, 0])).toContain("Percentage must be a finite number");
    expect(percentMessages([-20, 120])).toContain("Percentage must be greater than 0 and at most 100");
  });

  it("rejects more than 2 decimal places", () => {
    expect(percentMessages([33.333, 33.333, 33.334])).toContain("Percentages must have at most 2 decimal places");
  });
});

describe("expenseSplitSchema (API payload)", () => {
  it("rejects a zero or negative total", () => {
    expect(expenseSplitSchema.safeParse({ amount: "0", splitType: "equal", shares: [{ userId: "a" }] }).success).toBe(false);
    expect(expenseSplitSchema.safeParse({ amount: "-1", splitType: "equal", shares: [{ userId: "a" }] }).success).toBe(false);
  });

  it("rejects a total above the int64 stroop ceiling", () => {
    const result = expenseSplitSchema.safeParse({
      amount: "922337203685.4775808",
      splitType: "equal",
      shares: [{ userId: "a" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an equal split too small to give everyone a stroop", () => {
    const result = expenseSplitSchema.safeParse({
      amount: "0.0000001",
      splitType: "equal",
      shares: [{ userId: "a" }, { userId: "b" }],
    });
    expect(result.success).toBe(false);
  });

  it("requires a positive amount on every custom share", () => {
    const missing = expenseSplitSchema.safeParse({
      amount: "10",
      splitType: "custom",
      shares: [{ userId: "a", amount: "10" }, { userId: "b" }],
    });
    expect(missing.success).toBe(false);

    const zero = expenseSplitSchema.safeParse({
      amount: "10",
      splitType: "custom",
      shares: [
        { userId: "a", amount: "10" },
        { userId: "b", amount: "0" },
      ],
    });
    expect(zero.success).toBe(false);
  });

  it("rejects 0%, fractional-cent and non-finite ratios", () => {
    for (const shares of [
      [{ userId: "a", percent: 0 }, { userId: "b", percent: 100 }],
      [{ userId: "a", percent: 50.005 }, { userId: "b", percent: 49.995 }],
      [{ userId: "a", percent: Number.POSITIVE_INFINITY }],
    ]) {
      expect(expenseSplitSchema.safeParse({ amount: "10", splitType: "percentage", shares }).success).toBe(false);
    }
  });

  it("rejects a participant listed twice", () => {
    const result = expenseSplitSchema.safeParse({
      amount: "10",
      splitType: "custom",
      shares: [
        { userId: "a", amount: "5" },
        { userId: "a", amount: "5" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("still accepts a well-formed payload", () => {
    expect(
      expenseSplitSchema.safeParse({
        amount: "30.0000001",
        splitType: "custom",
        shares: [
          { userId: "a", amount: "10.0000001" },
          { userId: "b", amount: "20" },
        ],
      }).success
    ).toBe(true);
  });
});
