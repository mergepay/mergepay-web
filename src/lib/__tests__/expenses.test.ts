import { describe, it } from "node:test";
import assert from "node:assert";
import { sortExpensesByDateDesc } from "../expenses";
import type { Expense } from "../types";

function makeExpense(id: string, createdAt: string): Expense {
  return {
    id,
    groupId: "group-1",
    payerUserId: "user-1",
    payer: {
      id: "user-1",
      displayName: "Alice",
      stellarPublicKey: "G1...",
      avatarUrl: null,
      createdAt: "2026-01-01",
    },
    title: `Expense ${id}`,
    description: null,
    amount: "10",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt,
    shares: [],
  };
}

describe("sortExpensesByDateDesc", () => {
  it("orders expenses with the newest first", () => {
    const expenses = [
      makeExpense("old", "2024-01-01T00:00:00.000Z"),
      makeExpense("newer", "2024-03-01T00:00:00.000Z"),
      makeExpense("newest", "2024-02-01T00:00:00.000Z"),
    ];

    const sorted = sortExpensesByDateDesc(expenses);

    assert.deepStrictEqual(sorted.map((expense) => expense.id), ["newer", "newest", "old"]);
  });

  it("keeps equal dates in their original order", () => {
    const expenses = [makeExpense("first", "2024-01-01T00:00:00.000Z"), makeExpense("second", "2024-01-01T00:00:00.000Z")];

    const sorted = sortExpensesByDateDesc(expenses);

    assert.deepStrictEqual(sorted.map((expense) => expense.id), ["first", "second"]);
  });
});
