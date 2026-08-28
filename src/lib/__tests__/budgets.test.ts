import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { budgetPercent, budgetUsage } from "../budgets";

describe("budget tracking", () => {
  it("aggregates active expenses by category and excludes settled items", () => {
    assert.deepEqual(budgetUsage([{ category: "Food", amount: "12.50" }, { category: "food", amount: 7.5 }, { category: "Travel", amount: 20, settled: true }]), { Rent: 0, Food: 20, Event: 0, Travel: 0 });
  });
  it("caps visual progress while preserving over-budget detection", () => {
    assert.equal(budgetPercent(120, 100), 120);
  });
});
