import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { categorizeExpense, summarizeCategories } from "../analytics";

describe("group analytics", () => {
  it("categorizes expense metadata", () => {
    assert.equal(categorizeExpense({ title: "Monthly rent", description: null }), "Rent");
    assert.equal(categorizeExpense({ title: "Market run", description: "groceries" }), "Food");
    assert.equal(categorizeExpense({ title: "New chairs", description: null }), "Other");
  });

  it("totals categories without floating point drift", () => {
    const expenses = [
      { title: "Rent", description: null, amount: "10.0000000" },
      { title: "Food", description: "dinner", amount: "0.0000001" },
      { title: "Food", description: "lunch", amount: "2.0000000" },
    ] as any;
    assert.deepEqual(summarizeCategories(expenses), [
      { category: "Rent", amount: "10", percentage: 83.33, count: 1 },
      { category: "Food", amount: "2.0000001", percentage: 16.66, count: 2 },
    ]);
  });
});
