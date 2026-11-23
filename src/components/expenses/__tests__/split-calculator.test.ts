import { describe, it, expect } from "vitest";
import { expenseFormSchema, splitCalculatorSchema } from "@/lib/validations/expense";

describe("Currency and Split Validation & Formatting Rules", () => {
  it("strictly rejects negative amounts and excessive decimal places in the expense form", () => {
    const res = expenseFormSchema.safeParse({
      title: "Dinner",
      amount: "10.12345678",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const amountIssue = res.error.issues.find((i) => i.path.includes("amount"));
      expect(amountIssue?.message).toContain("decimal places");
    }
  });

  it("rejects negative numbers for custom splits", () => {
    const res = splitCalculatorSchema.safeParse({
      totalAmount: "100",
      mode: "custom",
      allocations: [
        { userId: "u1", amount: "-10", percent: "" },
        { userId: "u2", amount: "110", percent: "" },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("validates custom split amounts sum to total amount", () => {
    const validRes = splitCalculatorSchema.safeParse({
      totalAmount: "100",
      mode: "custom",
      allocations: [
        { userId: "u1", amount: "40", percent: "" },
        { userId: "u2", amount: "60", percent: "" },
      ],
    });
    expect(validRes.success).toBe(true);

    const invalidRes = splitCalculatorSchema.safeParse({
      totalAmount: "100",
      mode: "custom",
      allocations: [
        { userId: "u1", amount: "40", percent: "" },
        { userId: "u2", amount: "50", percent: "" },
      ],
    });
    expect(invalidRes.success).toBe(false);
  });

  it("validates percentage splits sum to 100%", () => {
    const validRes = splitCalculatorSchema.safeParse({
      totalAmount: "100",
      mode: "percentage",
      allocations: [
        { userId: "u1", amount: "", percent: "50" },
        { userId: "u2", amount: "", percent: "50" },
      ],
    });
    expect(validRes.success).toBe(true);

    const invalidRes = splitCalculatorSchema.safeParse({
      totalAmount: "100",
      mode: "percentage",
      allocations: [
        { userId: "u1", amount: "", percent: "40" },
        { userId: "u2", amount: "40" },
      ],
    });
    expect(invalidRes.success).toBe(false);
  });

  it("accepts valid positive decimals up to 7 places", () => {
    const res = expenseFormSchema.safeParse({
      title: "Coffee",
      amount: "12.3456789",
      assetCode: "USDC",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    expect(res.success).toBe(true);
  });

  it("rejects non-numeric characters and negative input formats in zod amount validation", () => {
    const negativeRes = expenseFormSchema.safeParse({
      title: "Bad Amount",
      amount: "-5.50",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    expect(negativeRes.success).toBe(false);

    const letterRes = expenseFormSchema.safeParse({
      title: "Bad Amount",
      amount: "12a34",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    expect(letterRes.success).toBe(false);
  });
});
