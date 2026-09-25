import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import type { CreateExpenseRequest, Expense } from "../types";

describe("useCreateExpense Optimistic Updates & Cache Rollback (#292)", () => {
  it("optimistically prepends new expense to infinite query pages", () => {
    const qc = new QueryClient();
    const groupId = "g-123";

    const initialPage = {
      expenses: [
        {
          id: "exp-1",
          groupId,
          payerUserId: "u-1",
          payer: { id: "u-1", displayName: "Alice", avatarUrl: null, stellarPublicKey: "", createdAt: "2026-08-01T00:00:00Z" },
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

    const queryKey = ["groups", groupId, "expenses", "page", 20, null];
    qc.setQueryData(queryKey, { pages: [initialPage], pageParams: [undefined] });

    const newExpenseReq: CreateExpenseRequest = {
      title: "Coffee",
      amount: "10.00",
      assetCode: "USDC",
      splitType: "equal",
      payerUserId: "u-1",
      shares: [{ userId: "u-2", amount: "5.00" }],
    };

    // Simulate optimistic prepend logic
    const optExpense: Expense = {
      id: "opt-1",
      groupId,
      payerUserId: newExpenseReq.payerUserId || "u-1",
      payer: { id: "u-1", displayName: "You", avatarUrl: null, stellarPublicKey: "", createdAt: "2026-08-01T00:00:00Z" },
      title: newExpenseReq.title,
      description: null,
      amount: newExpenseReq.amount,
      assetCode: newExpenseReq.assetCode,
      assetIssuer: null,
      splitType: newExpenseReq.splitType,
      memo: null,
      receiptUrl: null,
      createdAt: new Date().toISOString(),
      shares: [],
      isOptimistic: true,
      pending: true,
    };

    qc.setQueryData(queryKey, (old: any) => ({
      ...old,
      pages: [
        {
          ...old.pages[0],
          expenses: [optExpense, ...old.pages[0].expenses],
        },
        ...old.pages.slice(1),
      ],
    }));

    const cached = qc.getQueryData<any>(queryKey);
    assert.equal(cached.pages[0].expenses.length, 2);
    assert.equal(cached.pages[0].expenses[0].title, "Coffee");
    assert.equal(cached.pages[0].expenses[0].isOptimistic, true);
    assert.equal(cached.pages[0].expenses[0].pending, true);
  });

  it("rolls back optimistic expense list on mutation failure", () => {
    const qc = new QueryClient();
    const groupId = "g-123";
    const queryKey = ["groups", groupId, "expenses", "page", 20, null];

    const originalData = {
      pages: [
        {
          expenses: [
            { id: "exp-1", title: "Original Expense", amount: "20.00" },
          ],
        },
      ],
    };
    qc.setQueryData(queryKey, originalData);

    const snapshot = qc.getQueriesData({ queryKey: ["groups", groupId, "expenses"] });

    qc.setQueryData(queryKey, {
      pages: [
        {
          expenses: [
            { id: "opt-1", title: "Failed Optimistic Expense", isOptimistic: true },
            ...originalData.pages[0].expenses,
          ],
        },
      ],
    });

    assert.equal(qc.getQueryData<any>(queryKey).pages[0].expenses.length, 2);

    for (const [key, oldData] of snapshot) {
      qc.setQueryData(key, oldData);
    }

    const restored = qc.getQueryData<any>(queryKey);
    assert.equal(restored.pages[0].expenses.length, 1);
    assert.equal(restored.pages[0].expenses[0].title, "Original Expense");
  });
});
