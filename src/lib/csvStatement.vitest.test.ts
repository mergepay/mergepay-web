import { describe, it, expect } from "vitest";
import {
  buildGroupStatementCsv,
  generateGroupStatementFilename,
} from "./csvStatement";
import type { Expense, Settlement } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const alice = {
  id: "u1",
  stellarPublicKey: "GABC1234567890ABCDEFGHIJK",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const bob = {
  id: "u2",
  stellarPublicKey: "GDEF9876543210ZYXWVUTSRQ",
  displayName: "Bob",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: overrides.id ?? "e1",
    groupId: overrides.groupId ?? "g1",
    payerUserId: overrides.payerUserId ?? "u1",
    payer: overrides.payer ?? alice,
    title: overrides.title ?? "Dinner",
    description: overrides.description ?? null,
    amount: overrides.amount ?? "40.0000000",
    assetCode: overrides.assetCode ?? "XLM",
    assetIssuer: overrides.assetIssuer ?? null,
    splitType: overrides.splitType ?? "equal",
    memo: overrides.memo ?? null,
    receiptUrl: overrides.receiptUrl ?? null,
    createdAt: overrides.createdAt ?? "2026-06-15T12:00:00Z",
    shares: overrides.shares ?? [
      {
        id: "s1",
        expenseId: overrides.id ?? "e1",
        userId: "u1",
        user: alice,
        shareAmount: "20.0000000",
        status: "pending",
      },
      {
        id: "s2",
        expenseId: overrides.id ?? "e1",
        userId: "u2",
        user: bob,
        shareAmount: "20.0000000",
        status: "settled",
      },
    ],
  };
}

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: overrides.id ?? "st1",
    groupId: overrides.groupId ?? "g1",
    fromUserId: overrides.fromUserId ?? "u2",
    from: overrides.from ?? bob,
    toUserId: overrides.toUserId ?? "u1",
    to: overrides.to ?? alice,
    amount: overrides.amount ?? "20.0000000",
    assetCode: overrides.assetCode ?? "XLM",
    assetIssuer: overrides.assetIssuer ?? null,
    stellarTxHash: overrides.stellarTxHash ?? "abc123def456abc123def456abc123def456abc123def456abc123def456abcd",
    status: overrides.status ?? "confirmed",
    memo: overrides.memo ?? "dinner-8f3a",
    expenseId: overrides.expenseId ?? null,
    createdAt: overrides.createdAt ?? "2026-06-16T10:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// buildGroupStatementCsv
// ---------------------------------------------------------------------------

describe("buildGroupStatementCsv", () => {
  it("returns only the header row when both lists are empty", () => {
    const csv = buildGroupStatementCsv([], []);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Type");
    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Title");
  });

  it("has 14 columns in the header", () => {
    const csv = buildGroupStatementCsv([], []);
    const header = csv.split("\n")[0];
    const columns = header.split(",");
    expect(columns).toHaveLength(14);
  });

  it("generates one row per share for expenses", () => {
    const expense = makeExpense();
    const csv = buildGroupStatementCsv([expense], []);
    const lines = csv.split("\n");
    // Header + 2 shares = 3 lines
    expect(lines).toHaveLength(3);
    // Both rows should have expense type
    expect(lines[1]).toContain("expense");
    expect(lines[2]).toContain("expense");
  });

  it("generates one row per settlement", () => {
    const settlement = makeSettlement();
    const csv = buildGroupStatementCsv([], [settlement]);
    const lines = csv.split("\n");
    // Header + 1 settlement = 2 lines
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("settlement");
  });

  it("includes share details in expense rows", () => {
    const expense = makeExpense();
    const csv = buildGroupStatementCsv([expense], []);
    const lines = csv.split("\n");
    // First share (Alice) row
    expect(lines[1]).toContain("Alice");
    expect(lines[1]).toContain("20.0000000");
    expect(lines[1]).toContain("Pending");
    // Second share (Bob) row
    expect(lines[2]).toContain("Bob");
    expect(lines[2]).toContain("20.0000000");
    expect(lines[2]).toContain("Settled");
  });

  it("includes settlement details", () => {
    const settlement = makeSettlement();
    const csv = buildGroupStatementCsv([], [settlement]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Bob → Alice");
    expect(lines[1]).toContain("confirmed");
    expect(lines[1]).toContain("dinner-8f3a");
    expect(lines[1]).toContain(settlement.stellarTxHash!);
  });

  it("sorts rows oldest-first", () => {
    const early = makeExpense({ createdAt: "2026-01-10T00:00:00Z", title: "Early" });
    const late = makeExpense({ createdAt: "2026-12-20T00:00:00Z", title: "Late" });
    const csv = buildGroupStatementCsv([late, early], []);
    const lines = csv.split("\n");
    // Each expense has 2 shares, so early shares come first (lines 1-2),
    // then late shares (lines 3-4).
    expect(lines[1]).toContain("Early");
    expect(lines[2]).toContain("Early");
    expect(lines[3]).toContain("Late");
    expect(lines[4]).toContain("Late");
  });

  it("handles descriptions with commas and quotes", () => {
    const expense = makeExpense({
      title: "Lunch",
      description: 'A "nice" meal, with commas',
    });
    const csv = buildGroupStatementCsv([expense], []);
    const lines = csv.split("\n");
    // The description should be properly quoted in CSV
    expect(lines[1]).toContain('"A ""nice"" meal, with commas"');
  });

  it("handles memos with special characters", () => {
    const settlement = makeSettlement({ memo: "MP:dinner, 1/2 split" });
    const csv = buildGroupStatementCsv([], [settlement]);
    const lines = csv.split("\n");
    // Memo should be CSV-quoted
    expect(lines[1]).toContain('"MP:dinner, 1/2 split"');
  });

  it("handles expenses with no shares", () => {
    const expense = makeExpense({ shares: [] });
    const csv = buildGroupStatementCsv([expense], []);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // Header + 1 row
    expect(lines[1]).toContain("expense");
    // No participant or share amount columns filled
  });

  it("filters by start date", () => {
    const early = makeExpense({ createdAt: "2026-01-10T00:00:00Z", title: "Early" });
    const late = makeExpense({ createdAt: "2026-06-20T00:00:00Z", title: "Late" });
    const csv = buildGroupStatementCsv([early, late], [], {
      startDate: "2026-06-01",
    });
    const lines = csv.split("\n");
    // Only the late expense should appear (2 shares = 2 data rows + header)
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Late");
    expect(lines[2]).toContain("Late");
  });

  it("filters by end date", () => {
    const early = makeExpense({ createdAt: "2026-01-10T00:00:00Z", title: "Early" });
    const late = makeExpense({ createdAt: "2026-06-20T00:00:00Z", title: "Late" });
    const csv = buildGroupStatementCsv([early, late], [], {
      endDate: "2026-03-01",
    });
    const lines = csv.split("\n");
    // Only the early expense (2 shares) should appear
    expect(lines).toHaveLength(3); // Header + 2 rows
    expect(lines[1]).toContain("Early");
  });

  it("mixes expenses and settlements in chronological order", () => {
    const expense = makeExpense({ createdAt: "2026-03-15T00:00:00Z", title: "Taxi" });
    const settlement = makeSettlement({ createdAt: "2026-01-10T00:00:00Z" });
    const csv = buildGroupStatementCsv([expense], [settlement]);
    const lines = csv.split("\n");
    // Settlement (Jan) comes before expense (Mar)
    // Settlement row (1 row) then expense rows (2 shares)
    expect(lines[1]).toContain("settlement");
    expect(lines[2]).toContain("expense");
    expect(lines[3]).toContain("expense");
  });

  it("includes split mode for expenses", () => {
    const expense = makeExpense({ splitType: "custom" });
    const csv = buildGroupStatementCsv([expense], []);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("custom");
  });

  it("handles missing tx hash in settlements", () => {
    const settlement = makeSettlement();
    settlement.stellarTxHash = null;
    const csv = buildGroupStatementCsv([], [settlement]);
    const lines = csv.split("\n");
    // Tx hash column should be empty
    const cols = lines[1].split(",");
    expect(cols[13]).toBe(""); // Tx Hash column is last (index 13)
  });
});

// ---------------------------------------------------------------------------
// generateGroupStatementFilename
// ---------------------------------------------------------------------------

describe("generateGroupStatementFilename", () => {
  it("generates a descriptive filename with date", () => {
    const filename = generateGroupStatementFilename("g123", new Date("2026-07-15T10:00:00Z"));
    expect(filename).toBe("mergepay-statement-g123-2026-07-15.csv");
  });

  it("uses today's date when no date is provided", () => {
    const filename = generateGroupStatementFilename("g456");
    const today = new Date().toISOString().slice(0, 10);
    expect(filename).toBe(`mergepay-statement-g456-${today}.csv`);
  });
});
