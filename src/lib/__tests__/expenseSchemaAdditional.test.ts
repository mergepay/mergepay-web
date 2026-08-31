import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseFormSchema } from "../validations/expense";

describe("expenseFormSchema advanced split checks", () => {
  it("fails when custom split shares exceed total expense amount", () => {
    const res = expenseFormSchema.safeParse({
      title: "Lunch",
      amount: "50.00",
      assetCode: "XLM",
      splitType: "custom",
      shares: [
        { userId: "u1", amount: "30.00" },
        { userId: "u2", amount: "30.00" },
      ],
    });
    assert.equal(res.success, false);
  });

  it("fails when percentage shares fall short of 100", () => {
    const res = expenseFormSchema.safeParse({
      title: "Trip",
      amount: "100.00",
      assetCode: "XLM",
      splitType: "percentage",
      shares: [
        { userId: "u1", percent: 40 },
        { userId: "u2", percent: 50 },
      ],
    });
    assert.equal(res.success, false);
  });
});
