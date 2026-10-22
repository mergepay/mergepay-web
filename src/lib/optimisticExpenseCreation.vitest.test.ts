import { describe, expect, it } from "vitest";
import {
  OPTIMISTIC_EXPENSE_PREFIX,
  isOptimisticExpenseId,
} from "./optimistic";

describe("Optimistic expense creation cache helpers (#617)", () => {
  it("recognizes client-generated optimistic expense identifiers", () => {
    expect(isOptimisticExpenseId(`${OPTIMISTIC_EXPENSE_PREFIX}abc-123`)).toBe(true);
    expect(isOptimisticExpenseId("server-expense-99")).toBe(false);
  });
});
