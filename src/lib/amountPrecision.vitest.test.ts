/**
 * Unit tests for the decimal-amount validation added for #544.
 *
 * Two layers are checked, because they catch different mistakes:
 *   - the keystroke gate (`isTypableAmount` / `isTypablePercent` /
 *     `isBlockedDecimalKey`) refuses a character, so a field can never hold a
 *     value the ledger cannot represent.
 *   - the Zod schemas (`createExpenseSchema`, `settleBalanceSchema`,
 *     `expenseShareInputSchema`, `expenseSplitSchema`) reject the same values
 *     on submit, which is what a pasted or API-supplied payload goes through.
 *
 * The edge cases are the ones floating-point checks used to let through:
 * zero, negatives, exponents, and an eighth decimal place.
 *
 * Runner: vitest (`*.vitest.test.ts` include pattern in vitest.config.ts).
 * Execute: npm test
 */

import { describe, expect, it } from "vitest";
import {
  AMOUNT_DECIMAL_PLACES,
  PERCENT_DECIMAL_PLACES,
  isBlockedDecimalKey,
  isTypableAmount,
  isTypablePercent,
} from "./expenseValidation";
import {
  createExpenseSchema,
  expenseShareInputSchema,
  settleBalanceSchema,
  validateExpenseAmount,
} from "./validation";
import { MAX_DECIMAL_PLACES } from "./money";
import { expenseSplitSchema } from "./expenseValidation";

const expenseBase = {
  title: "Dinner",
  assetCode: "USDC",
  payerUserId: "u1",
  splitType: "equal",
  shares: [{ userId: "u1" }, { userId: "u2" }],
};

/** Parse one amount through createExpenseSchema and report the verdict. */
function expenseAmountRejected(amount: string): boolean {
  return !createExpenseSchema.safeParse({ ...expenseBase, amount }).success;
}

function shareAmountRejected(amount: string): boolean {
  return !expenseShareInputSchema.safeParse({ userId: "u1", amount }).success;
}

describe("decimal input gate", () => {
  it("allows a partially typed amount", () => {
    for (const value of ["", "0", "1", "12", "12.", "0.5", "0.0000001"]) {
      expect(isTypableAmount(value), value).toBe(true);
    }
  });

  it("allows exactly the Stellar precision and no more", () => {
    expect(AMOUNT_DECIMAL_PLACES).toBe(MAX_DECIMAL_PLACES);
    expect(isTypableAmount(`1.${"0".repeat(AMOUNT_DECIMAL_PLACES)}`)).toBe(true);
    expect(isTypableAmount(`1.${"0".repeat(AMOUNT_DECIMAL_PLACES + 1)}`)).toBe(false);
  });

  it("refuses notation the ledger cannot hold", () => {
    for (const value of ["-1", "+1", "1e5", "1E5", "abc", "1.2.3", " ", "1 2", "0x10", "..1"]) {
      expect(isTypableAmount(value), value).toBe(false);
    }
  });

  it("uses a separate precision budget for percentages", () => {
    expect(PERCENT_DECIMAL_PLACES).toBe(2);
    expect(isTypablePercent("33.33")).toBe(true);
    expect(isTypablePercent("33.333")).toBe(false);
  });

  it("blocks the keys that would produce those values", () => {
    for (const key of ["e", "E", "+", "-"]) {
      expect(isBlockedDecimalKey(key), key).toBe(true);
    }
    for (const key of ["1", ".", "Backspace", "Tab", "Delete", "ArrowLeft"]) {
      expect(isBlockedDecimalKey(key), key).toBe(false);
    }
  });
});

describe("createExpenseSchema amount (#544)", () => {
  it("accepts a plain positive decimal inside the precision budget", () => {
    expect(expenseAmountRejected("50.00")).toBe(false);
    expect(expenseAmountRejected("0.0000001")).toBe(false);
    expect(expenseAmountRejected("123456789.1234567")).toBe(false);
  });

  it("rejects zero", () => {
    expect(expenseAmountRejected("0")).toBe(true);
    expect(expenseAmountRejected("0.0000000")).toBe(true);
  });

  it("rejects negative and non-numeric amounts", () => {
    for (const amount of ["-10", "-0.01", "abc", "", "   ", "1,000", "$10", "10 USD"]) {
      expect(expenseAmountRejected(amount), amount).toBe(true);
    }
  });

  it("rejects an eighth decimal place", () => {
    expect(expenseAmountRejected("0.00000001")).toBe(true);
    expect(expenseAmountRejected("50.12345678")).toBe(true);
  });

  it("rejects exponential notation", () => {
    // `Number("1e-9") > 0` is true, so the old float check accepted all of
    // these and the ledger rejected the payment afterwards.
    for (const amount of ["1e-9", "1e5", "1E5", "-1e5", "1.5e10"]) {
      expect(expenseAmountRejected(amount), amount).toBe(true);
    }
  });

  it("rejects an amount beyond Stellar's int64 magnitude", () => {
    expect(expenseAmountRejected("92233720368547758.08")).toBe(true);
  });

  it("says which rule an amount broke", () => {
    const result = createExpenseSchema.safeParse({ ...expenseBase, amount: "0.123456789" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toContain(`${AMOUNT_DECIMAL_PLACES} decimal place`);
  });
});

describe("custom split sums", () => {
  it("requires the shares to add up exactly", () => {
    const shares = [
      { userId: "u1", amount: "10.00" },
      { userId: "u2", amount: "20.00" },
    ];
    const exact = createExpenseSchema.safeParse({
      ...expenseBase,
      amount: "30.00",
      splitType: "custom",
      shares,
    });
    expect(exact.success).toBe(true);

    const short = createExpenseSchema.safeParse({
      ...expenseBase,
      amount: "40.00",
      splitType: "custom",
      shares,
    });
    expect(short.success).toBe(false);
  });

  it("is not fooled by a float rounding difference", () => {
    // 0.1 + 0.2 !== 0.3 as a float; compared in stroops these are exact, so a
    // 10^-7 tolerance no longer decides the verdict.
    const shares = [
      { userId: "u1", amount: "0.1" },
      { userId: "u2", amount: "0.2" },
    ];
    const result = createExpenseSchema.safeParse({
      ...expenseBase,
      amount: "0.3",
      splitType: "custom",
      shares,
    });
    expect(result.success).toBe(true);

    // And a one-stroop shortfall that a 0.0001 float tolerance used to swallow
    // is now reported.
    const offByOneStroop = createExpenseSchema.safeParse({
      ...expenseBase,
      amount: "0.3000001",
      splitType: "custom",
      shares,
    });
    expect(offByOneStroop.success).toBe(false);
  });

  it("refuses an over-precise share rather than rounding it", () => {
    const result = createExpenseSchema.safeParse({
      ...expenseBase,
      amount: "30",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "10.00000001" },
        { userId: "u2", amount: "20" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("expenseShareInputSchema", () => {
  it("treats the amount as optional", () => {
    expect(expenseShareInputSchema.safeParse({ userId: "u1" }).success).toBe(true);
    expect(
      expenseShareInputSchema.safeParse({ userId: "u1", amount: undefined }).success
    ).toBe(true);
  });

  it("permits zero: an unset row is not an invalid amount", () => {
    expect(shareAmountRejected("0")).toBe(false);
    expect(shareAmountRejected("0.0000000")).toBe(false);
  });

  it("rejects negative, exponential, over-precise and non-numeric", () => {
    for (const amount of ["-0.01", "1e5", "0.00000001", "abc", " ", "1.2.3"]) {
      expect(shareAmountRejected(amount), amount).toBe(true);
    }
  });

  it("requires a member id", () => {
    expect(expenseShareInputSchema.safeParse({ userId: "  " }).success).toBe(false);
  });
});

describe("settleBalanceSchema", () => {
  it("applies the same amount rules as an expense", () => {
    const valid = { recipientId: "user-2", assetCode: "XLM" };
    expect(settleBalanceSchema.safeParse({ ...valid, amount: "25.50" }).success).toBe(true);
    for (const amount of ["-10.00", "0", "1e-9", "25.50000001", "abc"]) {
      expect(
        settleBalanceSchema.safeParse({ ...valid, amount }).success,
        amount
      ).toBe(false);
    }
  });

  it("agrees with validateExpenseAmount, the validator the API route uses", () => {
    for (const amount of ["1", "0", "-1", "1e5", "0.1234567", "0.12345678", "abc"]) {
      const schemaSays = settleBalanceSchema.safeParse({
        recipientId: "u",
        assetCode: "XLM",
        amount,
      }).success;
      expect(schemaSays, amount).toBe(validateExpenseAmount(amount).valid);
    }
  });
});

describe("expenseSplitSchema (#544 across the split validators)", () => {
  it("enforces the same 7-decimal ceiling on the total and each share", () => {
    expect(
      expenseSplitSchema.safeParse({
        amount: "30.0000001",
        splitType: "custom",
        shares: [
          { userId: "u1", amount: "10.0000001" },
          { userId: "u2", amount: "20" },
        ],
      }).success
    ).toBe(true);

    expect(
      expenseSplitSchema.safeParse({
        amount: "30.00000001",
        splitType: "equal",
        shares: [{ userId: "u1" }],
      }).success
    ).toBe(false);

    expect(
      expenseSplitSchema.safeParse({
        amount: "30",
        splitType: "custom",
        shares: [
          { userId: "u1", amount: "10.12345678" },
          { userId: "u2", amount: "19.87654322" },
        ],
      }).success
    ).toBe(false);
  });

  it("refuses exponential notation outright", () => {
    expect(
      expenseSplitSchema.safeParse({
        amount: "3e1",
        splitType: "equal",
        shares: [{ userId: "u1" }],
      }).success
    ).toBe(false);
  });

  it("keeps a keystroke-valid amount valid in the schema", () => {
    // Anything the input gate lets a user type must either pass the schema or
    // be zero — otherwise the field accepts input the form cannot submit.
    for (const value of ["0", "1", "12.", "0.0000001", "9999999.9999999"]) {
      const schemaResult = validateExpenseAmount(value);
      if (value === "0") {
        expect(schemaResult.valid, value).toBe(false);
        continue;
      }
      expect(schemaResult.valid, value).toBe(true);
    }
  });
});
