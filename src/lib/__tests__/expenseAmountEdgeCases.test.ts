import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseFormSchema } from "../validations/expense";

describe("Expense creation Zod validation schema edge cases", () => {
  it("rejects negative amounts", () => {
    const res = expenseFormSchema.safeParse({
      title: "Lunch",
      amount: "-15.00",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    assert.equal(res.success, false);
  });

  it("rejects excessive decimal precision beyond 7 places", () => {
    const res = expenseFormSchema.safeParse({
      title: "Coffee",
      amount: "10.12345678",
      assetCode: "USDC",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    assert.equal(res.success, false);
  });

  it("rejects empty or non-numeric amount strings", () => {
    const resEmpty = expenseFormSchema.safeParse({
      title: "Snacks",
      amount: "",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    assert.equal(resEmpty.success, false);

    const resText = expenseFormSchema.safeParse({
      title: "Snacks",
      amount: "abc",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      payerUserId: "u1",
    });
    assert.equal(resText.success, false);
  });
});
