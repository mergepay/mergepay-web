import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseCreationSchema } from "../validators/expense";

describe("expenseCreationSchema (#714)", () => {
  const validExpense = {
    title: "Team Lunch",
    amount: "100",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal" as const,
    shares: [
      { userId: "user-1" },
      { userId: "user-2" },
    ],
    payerUserId: "user-1",
    memo: null,
    receiptUrl: null,
  };

  it("accepts a valid equal split expense", () => {
    const result = expenseCreationSchema.safeParse(validExpense);
    assert.equal(result.success, true);
  });

  it("rejects zero amount", () => {
    const result = expenseCreationSchema.safeParse({
      ...validExpense,
      amount: "0",
    });
    assert.equal(result.success, false);
  });

  it("rejects negative amount", () => {
    const result = expenseCreationSchema.safeParse({
      ...validExpense,
      amount: "-50",
    });
    assert.equal(result.success, false);
  });

  it("rejects empty participants list", () => {
    const result = expenseCreationSchema.safeParse({
      ...validExpense,
      shares: [],
    });
    assert.equal(result.success, false);
  });
});
