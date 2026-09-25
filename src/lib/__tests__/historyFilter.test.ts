import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Expense, Settlement } from "../types";
import {
  toHistoryRow,
  matchesHistoryFilters,
  filterHistoryRows,
  hasActiveFilters,
  type HistoryFilters,
} from "../historyFilter";

const baseExpense: Expense = {
  id: "e1",
  groupId: "g1",
  payerUserId: "u1",
  payer: {
    id: "u1",
    stellarPublicKey: "GALICE1",
    displayName: "Alice",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  title: "Team lunch",
  description: null,
  amount: "40.5000000",
  assetCode: "USDC",
  assetIssuer: null,
  splitType: "equal",
  memo: "Thanks for organizing",
  receiptUrl: null,
  createdAt: "2024-03-01T12:00:00.000Z",
  shares: [
    {
      id: "s1",
      expenseId: "e1",
      userId: "u2",
      user: {
        id: "u2",
        stellarPublicKey: "GBOB1",
        displayName: "Bob",
        avatarUrl: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      shareAmount: "20.2500000",
      status: "pending",
    },
  ],
};

const baseSettlement: Settlement = {
  id: "s1",
  groupId: "g1",
  fromUserId: "u2",
  from: {
    id: "u2",
    stellarPublicKey: "GBOB1",
    displayName: "Bob",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  toUserId: "u1",
  to: {
    id: "u1",
    stellarPublicKey: "GALICE1",
    displayName: "Alice",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  amount: "20.0000000",
  assetCode: "XLM",
  assetIssuer: null,
  stellarTxHash: "abc123",
  status: "confirmed",
  memo: "Paying back the lunch",
  expenseId: "e1",
  createdAt: "2024-03-02T09:00:00.000Z",
};

describe("toHistoryRow", () => {
  it("maps an expense to a normalized search row", () => {
    const row = toHistoryRow({ type: "expense", ...baseExpense });
    assert.equal(row.type, "expense");
    assert.equal(row.assetCode, "USDC");
    assert.match(row.searchText.toLowerCase(), /team lunch/);
    assert.match(row.searchText.toLowerCase(), /alice/);
    assert.ok(row.participants.includes("Alice"));
    assert.ok(row.participants.includes("Bob"));
  });

  it("maps a settlement to a normalized search row", () => {
    const row = toHistoryRow({ type: "settlement", ...baseSettlement });
    assert.equal(row.type, "settlement");
    assert.match(row.searchText.toLowerCase(), /paying back the lunch/);
    assert.ok(row.participants.includes("Bob"));
    assert.ok(row.participants.includes("Alice"));
  });

  it("participants never include empties", () => {
    const s: Settlement = { ...baseSettlement, from: { ...baseSettlement.from, displayName: "" }, to: { ...baseSettlement.to, displayName: "" } };
    const row = toHistoryRow({ type: "settlement", ...s });
    assert.equal(row.participants.length, 0);
  });
});

describe("matchesHistoryFilters", () => {
  const expenseRow = toHistoryRow({ type: "expense", ...baseExpense });
  const settlementRow = toHistoryRow({ type: "settlement", ...baseSettlement });

  it("matches on keyword (title, memo, participant)", () => {
    assert.ok(matchesHistoryFilters(expenseRow, { keyword: "team lunch" }));
    assert.ok(matchesHistoryFilters(expenseRow, { keyword: "alice" }));
    assert.ok(matchesHistoryFilters(expenseRow, { keyword: "bob" }));
    assert.ok(!matchesHistoryFilters(expenseRow, { keyword: "nope" }));
  });

  it("is case-insensitive for keyword and asset code", () => {
    assert.ok(matchesHistoryFilters(expenseRow, { keyword: "TEAM LUNCH" }));
    assert.ok(matchesHistoryFilters(expenseRow, { assetCode: "usdc" }));
    assert.ok(!matchesHistoryFilters(expenseRow, { assetCode: "xlm" }));
  });

  it("matches by kind (expense vs settlement)", () => {
    assert.ok(matchesHistoryFilters(expenseRow, { kind: "all" }));
    assert.ok(matchesHistoryFilters(expenseRow, { kind: "expenses" }));
    assert.ok(!matchesHistoryFilters(expenseRow, { kind: "settlements" }));
    assert.ok(matchesHistoryFilters(settlementRow, { kind: "settlements" }));
  });

  it("matches by participant", () => {
    assert.ok(matchesHistoryFilters(expenseRow, { participant: "alice" }));
    assert.ok(matchesHistoryFilters(expenseRow, { participant: "BOB" }));
    assert.ok(!matchesHistoryFilters(expenseRow, { participant: "charlie" }));
  });

  it("matches by date range inclusively", () => {
    assert.ok(
      matchesHistoryFilters(expenseRow, {
        fromDate: "2024-03-01",
        toDate: "2024-03-01",
      })
    );
    assert.ok(!matchesHistoryFilters(expenseRow, { fromDate: "2024-03-02" }));
    assert.ok(!matchesHistoryFilters(expenseRow, { toDate: "2024-02-28" }));
  });

  it("empty filters match everything", () => {
    const filters: HistoryFilters = {};
    assert.ok(matchesHistoryFilters(expenseRow, filters));
    assert.ok(matchesHistoryFilters(settlementRow, filters));
  });
});

describe("filterHistoryRows", () => {
  it("returns a new array and never mutates the source", () => {
    const rows = [toHistoryRow({ type: "expense", ...baseExpense }), toHistoryRow({ type: "settlement", ...baseSettlement })];
    const before = rows.length;
    const filtered = filterHistoryRows(rows, { keyword: "lunch" });
    assert.equal(rows.length, before);
    assert.notStrictEqual(filtered, rows);
  });

  it("narrows the list and preserves order", () => {
    const expenseRow = toHistoryRow({ type: "expense", ...baseExpense });
    const settlementRow = toHistoryRow({ type: "settlement", ...baseSettlement });
    const rows = [settlementRow, expenseRow];
    const onlyExpenses = filterHistoryRows(rows, { kind: "expenses" });
    assert.deepEqual(onlyExpenses.map((r) => r.id), ["e1"]);
    const onlyXlm = filterHistoryRows(rows, { assetCode: "XLM" });
    assert.deepEqual(onlyXlm.map((r) => r.id), ["s1"]);
  });
});

describe("hasActiveFilters", () => {
  it("false when all filters are empty", () => {
    assert.equal(hasActiveFilters({}), false);
    assert.equal(hasActiveFilters({ kind: "all" }), false);
  });
  it("true when any filter is set", () => {
    assert.equal(hasActiveFilters({ keyword: "x" }), true);
    assert.equal(hasActiveFilters({ assetCode: "XLM" }), true);
    assert.equal(hasActiveFilters({ kind: "expenses" }), true);
    assert.equal(hasActiveFilters({ fromDate: "2024-01-01" }), true);
  });
});