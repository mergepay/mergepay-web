import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  buildOptimisticExpense,
  prependOptimisticExpense,
  restoreExpenseQueries,
  snapshotExpenseQueries,
} from "../expenseOptimistic";
import type { CreateExpenseRequest } from "../types";

const groupId = "g-123";
const queryKey = ["groups", groupId, "expenses", "page", 20, null];

function seedInfiniteList(qc: QueryClient) {
  const initialPage = {
    expenses: [
      {
        id: "exp-1",
        groupId,
        payerUserId: "u-1",
        payer: {
          id: "u-1",
          displayName: "Alice",
          avatarUrl: null,
          stellarPublicKey: "",
          createdAt: "2026-08-01T00:00:00Z",
        },
        title: "Dinner",
        description: null,
        amount: "50.00",
        assetCode: "USDC",
        assetIssuer: null,
        splitType: "equal",
        memo: null,
        receiptUrl: null,
        createdAt: "2026-08-20T10:00:00Z",
        shares: [],
      },
    ],
    nextCursor: null,
  };
  qc.setQueryData(queryKey, { pages: [initialPage], pageParams: [undefined] });
}

const newExpenseReq: CreateExpenseRequest = {
  title: "Coffee",
  amount: "10.00",
  assetCode: "USDC",
  splitType: "equal",
  payerUserId: "u-1",
  shares: [{ userId: "u-2", amount: "5.00" }],
};

describe("useCreateExpense Optimistic Updates & Cache Rollback (#292, #488)", () => {
  it("optimistically prepends new expense to infinite query pages", () => {
    const qc = new QueryClient();
    seedInfiniteList(qc);

    prependOptimisticExpense(
      qc,
      ["groups", groupId, "expenses"],
      buildOptimisticExpense(groupId, newExpenseReq, {
        id: "u-1",
        displayName: "You",
        avatarUrl: null,
        stellarPublicKey: "",
        createdAt: "2026-08-01T00:00:00Z",
      })
    );

    const cached = qc.getQueryData<any>(queryKey);
    assert.equal(cached.pages[0].expenses.length, 2);
    assert.equal(cached.pages[0].expenses[0].title, "Coffee");
    assert.equal(cached.pages[0].expenses[0].amount, "10.00");
    assert.equal(cached.pages[0].expenses[0].assetCode, "USDC");
    assert.equal(cached.pages[0].expenses[0].isOptimistic, true);
    assert.equal(cached.pages[0].expenses[0].pending, true);
    // Later pages are untouched.
    assert.equal(cached.pages.length, 1);
  });

  it("optimistically prepends to a plain (non-paginated) expense list", () => {
    const qc = new QueryClient();
    const plainKey = ["groups", groupId, "expenses", "summary"];
    qc.setQueryData(plainKey, { expenses: [{ id: "exp-1", title: "Dinner" }] });

    prependOptimisticExpense(
      qc,
      ["groups", groupId, "expenses"],
      buildOptimisticExpense(groupId, newExpenseReq)
    );

    const cached = qc.getQueryData<any>(plainKey);
    assert.equal(cached.expenses.length, 2);
    assert.equal(cached.expenses[0].title, "Coffee");
    assert.equal(cached.expenses[0].isOptimistic, true);
  });

  it("leaves caches with no data untouched", () => {
    const qc = new QueryClient();
    prependOptimisticExpense(
      qc,
      ["groups", groupId, "expenses"],
      buildOptimisticExpense(groupId, newExpenseReq)
    );
    assert.equal(qc.getQueryData(queryKey), undefined);
  });

  it("rolls back optimistic expense list on mutation failure", () => {
    const qc = new QueryClient();
    seedInfiniteList(qc);

    const snapshot = snapshotExpenseQueries(qc, ["groups", groupId, "expenses"]);

    prependOptimisticExpense(
      qc,
      ["groups", groupId, "expenses"],
      buildOptimisticExpense(groupId, newExpenseReq)
    );
    assert.equal(qc.getQueryData<any>(queryKey).pages[0].expenses.length, 2);

    restoreExpenseQueries(qc, snapshot);

    const restored = qc.getQueryData<any>(queryKey);
    assert.equal(restored.pages[0].expenses.length, 1);
    assert.equal(restored.pages[0].expenses[0].title, "Dinner");
  });

  it("never mutates the snapshot it returns", () => {
    const qc = new QueryClient();
    seedInfiniteList(qc);

    const snapshot = snapshotExpenseQueries(qc, ["groups", groupId, "expenses"]);
    prependOptimisticExpense(
      qc,
      ["groups", groupId, "expenses"],
      buildOptimisticExpense(groupId, newExpenseReq)
    );

    const before = snapshot[0][1] as { pages: Array<{ expenses: unknown[] }> };
    assert.equal(before.pages[0].expenses.length, 1);
  });
});
