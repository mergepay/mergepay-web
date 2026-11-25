import { describe, expect, it } from "vitest";
import { expenseSplitSchema } from "./expenseValidation";

describe("Expense creation and split Zod validation schemas (#615)", () => {
  it("validates custom stroop-accurate share splits matching total amount", () => {
    const validCustom = expenseSplitSchema.safeParse({
      amount: "30.0000000",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "12.5000000" },
        { userId: "u2", amount: "17.5000000" },
      ],
    });
    expect(validCustom.success).toBe(true);

    const mismatchedCustom = expenseSplitSchema.safeParse({
      amount: "30.0000000",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "10.0000000" },
        { userId: "u2", amount: "10.0000000" },
      ],
    });
    expect(mismatchedCustom.success).toBe(false);
  });

  it("enforces percentage splits summing to 100%", () => {
    expect(
      expenseSplitSchema.safeParse({
        amount: "100",
        splitType: "percentage",
        shares: [
          { userId: "u1", percent: 60 },
          { userId: "u2", percent: 40 },
        ],
      }).success
    ).toBe(true);

    expect(
      expenseSplitSchema.safeParse({
        amount: "100",
        splitType: "percentage",
        shares: [
          { userId: "u1", percent: 50 },
          { userId: "u2", percent: 30 },
        ],
      }).success
    ).toBe(false);
  });
});
