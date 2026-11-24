/**
 * Issue #897 — Zod schema edge cases for expense amounts: zero, negative,
 * malformed and over-precise values, including per-asset precision limits.
 */
import { describe, expect, it } from "vitest";
import { createExpenseFormSchema, expenseFormSchema } from "./expense";

const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const base = {
  title: "Dinner",
  amount: "30",
  assetCode: "XLM",
  assetIssuer: null as string | null,
  splitType: "equal" as const,
  shares: [{ userId: "a" }, { userId: "b" }],
  payerUserId: "a",
};

const schema = createExpenseFormSchema({
  memberIds: ["a", "b"],
  supportedAssets: [
    { code: "XLM", issuer: null },
    { code: "USDC", issuer: ISSUER },
    { code: "CENTS", issuer: ISSUER, decimals: 2 },
    { code: "WHOLE", issuer: ISSUER, decimals: 0 },
  ],
});

function messages(input: Record<string, unknown>, s: typeof schema | typeof expenseFormSchema = schema) {
  const r = s.safeParse({ ...base, ...input });
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("expense amount edge cases", () => {
  it("rejects zero in every spelling", () => {
    for (const amount of ["0", "0.0", "0.0000000"]) {
      expect(messages({ amount }).some((m) => m.includes("greater than zero"))).toBe(true);
    }
  });

  it("rejects negative amounts", () => {
    expect(messages({ amount: "-5" })).toContainEqual(expect.stringMatching(/^amount: .*plain number/));
  });

  it("rejects scientific notation, NaN and Infinity", () => {
    for (const amount of ["1e5", "NaN", "Infinity", "12abc", "1,000"]) {
      expect(messages({ amount }).some((m) => m.startsWith("amount:"))).toBe(true);
    }
  });

  it("rejects more than 7 decimals for any asset", () => {
    expect(messages({ amount: "1.12345678" }).some((m) => m.includes("7 decimal"))).toBe(true);
  });

  it("accepts the smallest XLM unit (1 stroop)", () => {
    expect(messages({ amount: "0.0000002" })).toEqual([]);
  });

  it("accepts 7-decimal USDC amounts", () => {
    expect(messages({ amount: "10.1234567", assetCode: "USDC", assetIssuer: ISSUER })).toEqual([]);
  });

  it("enforces a configured asset precision on the total", () => {
    const asset = { assetCode: "CENTS", assetIssuer: ISSUER };
    expect(messages({ ...asset, amount: "10.25" })).toEqual([]);
    expect(messages({ ...asset, amount: "10.255" })).toContain(
      "amount: CENTS amounts support at most 2 decimal places"
    );
  });

  it("requires whole numbers for a 0-decimal asset", () => {
    const asset = { assetCode: "WHOLE", assetIssuer: ISSUER };
    expect(messages({ ...asset, amount: "10" })).toEqual([]);
    expect(messages({ ...asset, amount: "10.5" })).toContain("amount: WHOLE amounts must be whole numbers");
  });

  it("enforces asset precision on custom share amounts", () => {
    const result = messages({
      assetCode: "CENTS",
      assetIssuer: ISSUER,
      amount: "10",
      splitType: "custom",
      shares: [
        { userId: "a", amount: "3.333" },
        { userId: "b", amount: "6.667" },
      ],
    });
    expect(result).toContain("shares.0.amount: CENTS amounts support at most 2 decimal places");
    expect(result).toContain("shares.1.amount: CENTS amounts support at most 2 decimal places");
  });

  it("reports custom shares that do not sum to the total", () => {
    const result = messages({
      amount: "10",
      splitType: "custom",
      shares: [
        { userId: "a", amount: "3" },
        { userId: "b", amount: "6" },
      ],
    });
    expect(result).toContainEqual(expect.stringMatching(/^shares: Custom shares are short by 1/));
  });

  it("reports percentages that do not total 100%", () => {
    const result = messages({
      splitType: "percentage",
      shares: [
        { userId: "a", percent: 50 },
        { userId: "b", percent: 40 },
      ],
    });
    expect(result).toContainEqual(expect.stringMatching(/^shares: Percentages add up to 90%/));
  });

  it("rejects negative and over-precise share values", () => {
    expect(
      messages({ amount: "10", splitType: "custom", shares: [{ userId: "a", amount: "-1" }, { userId: "b", amount: "11" }] })
    ).toContain("shares.0.amount: Amount must be a plain number");
    expect(
      messages({ splitType: "percentage", shares: [{ userId: "a", percent: -10 }, { userId: "b", percent: 110 }] })
    ).toContain("shares.0.percent: Percentage must be between 0 and 100");
  });
});
