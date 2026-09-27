import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Expense, Settlement } from "../types";
import {
  toHistoryRow, 
  matchesHistoryFilters,
  filterHistoryRows,
  hasActiveFilters,
  sortHistoryRows,
  type HistoryFilters,
  type HistoryRow,
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

describe("sortHistoryRows (issue #314)", () => {
  function row(
    id: string,
    createdAt: string,
    type: HistoryRow["type"] = "expense"
  ): HistoryRow {
    return {
      type,
      id,
      createdAt,
      assetCode: "XLM",
      searchText: `history item ${id}`,
      participants: [],
    };
  }

  it("sorts newest-first by default (history page order)", () => {
    const items = [row("old", "2024-03-01T12:00:00.000Z"), row("new", "2024-03-09T12:00:00.000Z"), row("mid", "2024-03-05T08:30:00.000Z")];
    const sorted = sortHistoryRows(items);
    assert.deepEqual(sorted.map((r) => r.id), ["new", "mid", "old"]);
  });

  it("sorts oldest-first when order is \"oldest\"", () => {
    const items = [row("new", "2024-03-09T12:00:00.000Z"), row("old", "2024-03-01T12:00:00.000Z"), row("mid", "2024-03-05T08:30:00.000Z")];
    const sorted = sortHistoryRows(items, "oldest");
    assert.deepEqual(sorted.map((r) => r.id), ["old", "mid", "new"]);
  });

  it("returns a new array and never mutates the source", () => {
    const items = [row("a", "2024-03-02T00:00:00.000Z"), row("b", "2024-03-03T00:00:00.000Z")];
    const before = [...items];
    const sorted = sortHistoryRows(items);
    assert.notStrictEqual(sorted, items);
    assert.deepEqual(items, before);
  });

  it("is stable for equal timestamps in both directions", () => {
    const same = "2024-03-04T10:00:00.000Z";
    const items = [row("first", same), row("second", same), row("third", "2024-03-01T00:00:00.000Z")];
    assert.deepEqual(sortHistoryRows(items).map((r) => r.id), ["first", "second", "third"]);
    assert.deepEqual(sortHistoryRows(items, "oldest").map((r) => r.id), ["third", "first", "second"]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(sortHistoryRows([]), []);
  });

  it("sorts mixed expense and settlement items together", () => {
    const items = [
      row("exp-1", "2024-03-02T00:00:00.000Z", "expense"),
      row("set-1", "2024-03-08T00:00:00.000Z", "settlement"),
      row("exp-2", "2024-03-05T00:00:00.000Z", "expense"),
    ];
    const sorted = sortHistoryRows(items);
    assert.deepEqual(sorted.map((r) => r.id), ["set-1", "exp-2", "exp-1"]);
  });
});

describe("filterHistoryRows combined filters (issue #314)", () => {
  const expenseRow = toHistoryRow({ type: "expense", ...baseExpense }); // USDC, title "Team lunch", memo "Thanks for organizing"
  const settlementRow = toHistoryRow({ type: "settlement", ...baseSettlement }); // XLM, memo "Paying back the lunch"

  it("applies asset type + search query simultaneously", () => {
    // USDC + "lunch" → only the expense matches (settlement is XLM).
    const both = filterHistoryRows([expenseRow, settlementRow], {
      assetCode: "USDC",
      keyword: "lunch",
    });
    assert.deepEqual(both.map((r) => r.id), ["e1"]);

    // XLM + "lunch" → only the settlement matches (expense is USDC).
    const bothXlm = filterHistoryRows([expenseRow, settlementRow], {
      assetCode: "XLM",
      keyword: "lunch",
    });
    assert.deepEqual(bothXlm.map((r) => r.id), ["s1"]);
  });

  it("combined filters with no overlap return an empty list", () => {
    const none = filterHistoryRows([expenseRow, settlementRow], {
      assetCode: "USDC",
      keyword: "paying back",
    });
    assert.deepEqual(none, []);
  });

  it("searches by expense description", () => {
    const described: Expense = {
      ...baseExpense,
      description: "Airport taxi ride share",
    };
    const describedRow = toHistoryRow({ type: "expense", ...described });
    assert.ok(matchesHistoryFilters(describedRow, { keyword: "taxi ride" }));
    assert.ok(!matchesHistoryFilters(describedRow, { keyword: "taxi ride to the airport" }));
  });

  it("searches by settlement memo", () => {
    assert.ok(matchesHistoryFilters(settlementRow, { keyword: "paying back" }));
    // Case-insensitive: the stored memo is "Paying back the lunch".
    assert.ok(matchesHistoryFilters(settlementRow, { keyword: "PAYING BACK" }));
    assert.ok(!matchesHistoryFilters(settlementRow, { keyword: "organizing" }));
  });

  it("combines asset + search + date range at once", () => {
    const rows = [expenseRow, settlementRow];
    const all = filterHistoryRows(rows, {
      assetCode: "XLM",
      keyword: "paying back",
      fromDate: "2024-03-02",
      toDate: "2024-03-02",
    });
    assert.deepEqual(all.map((r) => r.id), ["s1"]);
  });
});