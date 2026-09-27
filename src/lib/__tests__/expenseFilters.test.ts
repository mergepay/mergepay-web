/**
 * Issue #356 — filter predicates for the expense search & filter bar.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_EXPENSE_FILTERS,
  countActiveExpenseFilters,
  expenseDay,
  filterExpenses,
  isExpenseSettled,
  matchesAsset,
  matchesDateRange,
  matchesExpenseFilters,
  matchesKeyword,
  matchesStatus,
} from "../expenseFilters";
import type { Expense, ExpenseShare, ShareStatus, User } from "../types";

function user(id: string, displayName: string): User {
  return { id, stellarPublicKey: `G${id}`, displayName, avatarUrl: null, createdAt: "2026-01-01T00:00:00Z" };
}

function share(userId: string, name: string, status: ShareStatus): ExpenseShare {
  return { id: `s-${userId}`, expenseId: "e", userId, user: user(userId, name), shareAmount: "1.0000000", status };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    groupId: "g1",
    payerUserId: "u1",
    payer: user("u1", "Ada Lovelace"),
    title: "Dinner at Terra Kulture",
    description: "Birthday dinner",
    amount: "30.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: "MP:dinner-1a2b",
    receiptUrl: null,
    // Midday UTC stays on the same calendar day in every timezone from -11 to +11.
    createdAt: "2026-05-10T12:00:00Z",
    shares: [share("u2", "Grace Hopper", "pending"), share("u3", "Linus", "settled")],
    ...overrides,
  };
}

describe("matchesKeyword", () => {
  it("matches any searchable field, case-insensitively", () => {
    const e = expense();
    assert.equal(matchesKeyword(e, "terra"), true);
    assert.equal(matchesKeyword(e, "BIRTHDAY"), true);
    assert.equal(matchesKeyword(e, "mp:dinner"), true);
    assert.equal(matchesKeyword(e, "lovelace"), true);
    assert.equal(matchesKeyword(e, "grace"), true);
    assert.equal(matchesKeyword(e, "groceries"), false);
  });

  it("requires every word to match, in any field", () => {
    assert.equal(matchesKeyword(expense(), "dinner grace"), true);
    assert.equal(matchesKeyword(expense(), "dinner groceries"), false);
  });

  it("treats empty or whitespace keywords as no constraint", () => {
    assert.equal(matchesKeyword(expense(), ""), true);
    assert.equal(matchesKeyword(expense(), "   "), true);
    assert.equal(matchesKeyword(expense(), undefined), true);
  });

  it("tolerates null description and memo", () => {
    assert.equal(matchesKeyword(expense({ description: null, memo: null }), "dinner"), true);
  });
});

describe("matchesAsset", () => {
  it("filters by asset code", () => {
    assert.equal(matchesAsset(expense(), "XLM"), true);
    assert.equal(matchesAsset(expense(), "usdc"), false);
    assert.equal(matchesAsset(expense({ assetCode: "USDC" }), "usdc"), true);
    assert.equal(matchesAsset(expense(), ""), true);
  });
});

describe("isExpenseSettled / matchesStatus", () => {
  const settled = expense({ shares: [share("u2", "Grace", "settled")] });
  const partial = expense();
  const noShares = expense({ shares: [] });

  it("is settled only when every share is settled", () => {
    assert.equal(isExpenseSettled(settled), true);
    assert.equal(isExpenseSettled(partial), false);
    assert.equal(isExpenseSettled(noShares), false);
  });

  it("filters settled vs pending", () => {
    assert.equal(matchesStatus(settled, "settled"), true);
    assert.equal(matchesStatus(settled, "pending"), false);
    assert.equal(matchesStatus(partial, "pending"), true);
    assert.equal(matchesStatus(noShares, "pending"), true);
    assert.equal(matchesStatus(partial, "all"), true);
    assert.equal(matchesStatus(partial, undefined), true);
  });
});

describe("matchesDateRange", () => {
  const e = expense();

  it("reads the expense's local calendar day", () => {
    assert.equal(expenseDay(e.createdAt), "2026-05-10");
    assert.equal(expenseDay("garbage"), null);
  });

  it("is inclusive on both bounds", () => {
    assert.equal(matchesDateRange(e, "2026-05-10", "2026-05-10"), true);
    assert.equal(matchesDateRange(e, "2026-05-11", ""), false);
    assert.equal(matchesDateRange(e, "", "2026-05-09"), false);
    assert.equal(matchesDateRange(e, "2026-05-01", "2026-05-31"), true);
  });

  it("swaps a reversed range instead of matching nothing", () => {
    assert.equal(matchesDateRange(e, "2026-05-31", "2026-05-01"), true);
  });

  it("ignores malformed bounds", () => {
    assert.equal(matchesDateRange(e, "05/01/2026", ""), true);
  });

  it("excludes expenses with an unparseable date when a range is set", () => {
    assert.equal(matchesDateRange(expense({ createdAt: "nope" }), "2026-01-01", ""), false);
    assert.equal(matchesDateRange(expense({ createdAt: "nope" }), "", ""), true);
  });
});

describe("filterExpenses", () => {
  const list = [
    expense({ id: "a", description: null, memo: null, title: "Dinner", assetCode: "XLM", createdAt: "2026-05-01T12:00:00Z" }),
    expense({ id: "b", description: null, memo: null, title: "Taxi", assetCode: "USDC", createdAt: "2026-05-05T12:00:00Z", shares: [share("u2", "Grace", "settled")] }),
    expense({ id: "c", description: null, memo: null, title: "Dinner again", assetCode: "USDC", createdAt: "2026-05-09T12:00:00Z" }),
  ];
  const ids = (xs: Expense[]) => xs.map((x) => x.id);

  it("returns the same array when no filters are active", () => {
    assert.equal(filterExpenses(list, EMPTY_EXPENSE_FILTERS), list);
    assert.equal(filterExpenses(list, {}), list);
  });

  it("combines keyword, asset, status and date filters with AND", () => {
    assert.deepEqual(ids(filterExpenses(list, { keyword: "dinner" })), ["a", "c"]);
    assert.deepEqual(ids(filterExpenses(list, { keyword: "dinner", assetCode: "USDC" })), ["c"]);
    assert.deepEqual(ids(filterExpenses(list, { assetCode: "USDC", status: "settled" })), ["b"]);
    assert.deepEqual(ids(filterExpenses(list, { fromDate: "2026-05-02", toDate: "2026-05-08" })), ["b"]);
  });

  it("returns an empty list when nothing matches", () => {
    assert.deepEqual(filterExpenses(list, { keyword: "hotel" }), []);
  });

  it("matchesExpenseFilters agrees with filterExpenses", () => {
    const filters = { keyword: "taxi", status: "settled" as const };
    assert.deepEqual(
      list.filter((e) => matchesExpenseFilters(e, filters)),
      filterExpenses(list, filters)
    );
  });
});

describe("countActiveExpenseFilters", () => {
  it("counts only constraints in effect", () => {
    assert.equal(countActiveExpenseFilters(EMPTY_EXPENSE_FILTERS), 0);
    assert.equal(countActiveExpenseFilters({ keyword: "  ", status: "all" }), 0);
    assert.equal(
      countActiveExpenseFilters({ keyword: "x", assetCode: "XLM", status: "pending", fromDate: "2026-01-01", toDate: "2026-02-01" }),
      5
    );
  });
});
