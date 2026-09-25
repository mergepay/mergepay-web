import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTransactionHistoryCsv,
  buildTransactionHistoryFilename,
} from "../utils/transactionHistoryCsv";
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

describe("buildTransactionHistoryCsv", () => {
  it("emits the required header row", () => {
    const header = buildTransactionHistoryCsv([], []).split("\n")[0];
    assert.equal(
      header,
      "Type,Date,Title,Description,Amount,Asset,From,To,Status,Memo,Tx Hash"
    );
  });

  it("returns just the header for an empty history", () => {
    assert.equal(buildTransactionHistoryCsv([], []), "Type,Date,Title,Description,Amount,Asset,From,To,Status,Memo,Tx Hash");
  });

  it("writes each required column for an expense", () => {
    const csv = buildTransactionHistoryCsv(
      [
        expense({
          title: "Dinner at Terra Kulture",
          description: "Birthday dinner",
          amount: "150.0000000",
          assetCode: "USDC",
          splitType: "custom",
          memo: "MP:1a2b",
          shares: [
            {
              id: "s1",
              expenseId: "exp-1",
              userId: "user-b",
              user: user({ id: "user-b", displayName: "Grace" }),
              shareAmount: "75.0000000",
              status: "settled",
            },
          ],
        }),
      ],
      []
    );
    const row = csv.split("\n")[1];
    assert.equal(
      row,
      "expense,2024-05-01,Dinner at Terra Kulture,Birthday dinner,150.0000000,USDC,Ada,Grace,custom,MP:1a2b,"
    );
  });

  it("writes each required column for a settlement", () => {
    const csv = buildTransactionHistoryCsv([], [settlement()]);
    const row = csv.split("\n")[1];
    assert.equal(
      row,
      `settlement,2024-05-02,,,12.5000000,XLM,Ada,Grace,Confirmed,Dinner,${"a".repeat(64)}`
    );
  });

  it("sorts rows newest-first", () => {
    const csv = buildTransactionHistoryCsv(
      [
        expense({ id: "old", createdAt: "2024-01-01T00:00:00.000Z", title: "Old" }),
        expense({ id: "new", createdAt: "2024-06-01T00:00:00.000Z", title: "New" }),
      ],
      []
    );
    const rows = csv.split("\n").slice(1);
    assert.equal(rows[0].includes("New"), true);
    assert.equal(rows[1].includes("Old"), true);
  });

  it("quotes fields containing commas and quotes", () => {
    const csv = buildTransactionHistoryCsv(
      [expense({ title: 'He said "hi", pay up' })],
      []
    );
    assert.ok(csv.includes('"He said ""hi"", pay up"'));
  });

  it("preserves newlines inside quoted fields", () => {
    const csv = buildTransactionHistoryCsv(
      [expense({ title: "line1\nline2" })],
      []
    );
    assert.ok(csv.includes('"line1\nline2"'));
  });

  it("neutralizes formula prefixes in user-controlled fields", () => {
    const csv = buildTransactionHistoryCsv(
      [expense({ title: "=cmd|' /c calc'!A1" })],
      []
    );
    assert.ok(csv.includes(",'=cmd|' /c calc'!A1,"));
    assert.ok(!csv.includes(",=cmd|' /c calc'"));
  });

  it("neutralizes a formula memo on a settlement row", () => {
    const csv = buildTransactionHistoryCsv([], [settlement({ memo: "=1+1" })]);
    assert.ok(csv.includes(",'=1+1,"));
    assert.ok(!csv.includes(",=1+1,"));
  });
});

describe("buildTransactionHistoryFilename", () => {
  it("follows the mergepay-history-{timestamp}.csv pattern", () => {
    const name = buildTransactionHistoryFilename(
      new Date("2024-05-01T12:00:00.000Z")
    );
    assert.equal(name, "mergepay-history-2024-05-01T12-00-00-000Z.csv");
  });

  it("produces a unique name per call", () => {
    const a = buildTransactionHistoryFilename(new Date("2024-05-01T12:00:00.000Z"));
    const b = buildTransactionHistoryFilename(new Date("2024-05-01T12:00:01.000Z"));
    assert.notEqual(a, b);
  });
});
