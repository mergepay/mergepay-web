import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTransactionHistoryCsv,
  buildTransactionHistoryFilename,
  escapeCsv,
} from "../exportCsv";
import type { Expense, Settlement, User } from "../types";

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-a",
    stellarPublicKey: "GABC",
    displayName: "Ada",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    groupId: "grp-1",
    payerUserId: "user-a",
    payer: user(),
    title: "Dinner",
    description: null,
    amount: "100.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2024-05-01T12:00:00.000Z",
    shares: [],
    ...overrides,
  };
}

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: "stl-1",
    groupId: "grp-1",
    fromUserId: "user-a",
    from: user(),
    toUserId: "user-b",
    to: user({ id: "user-b", displayName: "Grace" }),
    amount: "12.5000000",
    assetCode: "XLM",
    assetIssuer: null,
    stellarTxHash: "a".repeat(64),
    status: "confirmed",
    memo: "Dinner",
    expenseId: null,
    createdAt: "2024-05-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("exportCsv utility", () => {
  it("escapes formulas and quotes correctly", () => {
    assert.equal(escapeCsv("=1+1"), "'=1+1");
    assert.equal(escapeCsv('say "hi"'), '"say ""hi"""');
  });

  it("builds correct headers and rows", () => {
    const csv = buildTransactionHistoryCsv([expense()], [settlement()]);
    const lines = csv.split("\n");
    assert.equal(
      lines[0],
      "Type,Date,Title,Description,Amount,Asset,From,To,Status,Memo,Tx Hash"
    );
    assert.equal(lines.length, 3);
  });

  it("generates filename with group id and date", () => {
    const fn = buildTransactionHistoryFilename("group-123");
    assert.ok(fn.startsWith("mergepay-history-group-123-"));
    assert.ok(fn.endsWith(".csv"));
  });
});
