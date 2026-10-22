import { describe, expect, it } from "vitest";
import {
  filterExpenses,
  countActiveExpenseFilters,
  EMPTY_EXPENSE_FILTERS,
} from "./expenseFilters";
import type { Expense } from "./types";

const sampleExpenses = [
  {
    id: "exp-1",
    groupId: "grp-1",
    title: "Airport Taxi",
    description: "Ride to terminal",
    memo: "MP:taxi-1001",
    amount: "40.0000000",
    assetCode: "USDC",
    paidById: "u1",
    payer: { id: "u1", displayName: "Alice" },
    shares: [
      { id: "s1", expenseId: "exp-1", userId: "u2", shareAmount: "20.0000000", status: "settled" },
    ],
    createdAt: "2026-10-15T12:00:00.000Z",
  },
  {
    id: "exp-2",
    groupId: "grp-1",
    title: "Team Dinner",
    description: "Sushi night",
    memo: "MP:sushi-2002",
    amount: "120.0000000",
    assetCode: "XLM",
    paidById: "u2",
    payer: { id: "u2", displayName: "Bob" },
    shares: [
      { id: "s2", expenseId: "exp-2", userId: "u1", shareAmount: "60.0000000", status: "pending" },
    ],
    createdAt: "2026-10-16T18:30:00.000Z",
  },
] as unknown as Expense[];

describe("Group expense history search and status filters (#628)", () => {
  it("filters expenses case-insensitively by title, description, or MP memo", () => {
    const byTitle = filterExpenses(sampleExpenses, {
      ...EMPTY_EXPENSE_FILTERS,
      keyword: "airport",
    });
    expect(byTitle.map((e) => e.id)).toEqual(["exp-1"]);

    const byMemo = filterExpenses(sampleExpenses, {
      ...EMPTY_EXPENSE_FILTERS,
      keyword: "mp:sushi-2002",
    });
    expect(byMemo.map((e) => e.id)).toEqual(["exp-2"]);
  });

  it("filters expenses by settled vs pending status and asset code", () => {
    const settledOnly = filterExpenses(sampleExpenses, {
      ...EMPTY_EXPENSE_FILTERS,
      status: "settled",
    });
    expect(settledOnly.map((e) => e.id)).toEqual(["exp-1"]);

    const pendingOnly = filterExpenses(sampleExpenses, {
      ...EMPTY_EXPENSE_FILTERS,
      status: "pending",
    });
    expect(pendingOnly.map((e) => e.id)).toEqual(["exp-2"]);
  });

  it("counts active filter controls accurately", () => {
    expect(countActiveExpenseFilters(EMPTY_EXPENSE_FILTERS)).toBe(0);
    expect(
      countActiveExpenseFilters({
        keyword: "sushi",
        status: "pending",
        assetCode: "XLM",
      })
    ).toBe(3);
  });
});
