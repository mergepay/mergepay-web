import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Expense, Settlement } from "@/lib/types";
import {
  toHistoryRow,
  matchesHistoryFilters,
  filterHistoryRows,
  type HistoryFilters,
} from "@/lib/historyFilter";
import { HistoryFilterBar } from "@/components/history/HistoryFilterBar";

const mockExpense: Expense = {
  id: "exp-1",
  groupId: "grp-1",
  payerUserId: "usr-alice",
  payer: {
    id: "usr-alice",
    stellarPublicKey: "GALICE7777777777777777777777777777777777777777777777777777",
    displayName: "Alice Developer",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  title: "Dinner in Berlin",
  description: "Shared team food and drinks",
  amount: "85.5000000",
  assetCode: "USDC",
  assetIssuer: null,
  splitType: "equal",
  memo: "BERLIN-DINNER-OCT24",
  receiptUrl: null,
  createdAt: "2024-10-24T18:00:00.000Z",
  shares: [
    {
      id: "sh-1",
      expenseId: "exp-1",
      userId: "usr-bob",
      user: {
        id: "usr-bob",
        stellarPublicKey: "GBOB888888888888888888888888888888888888888888888888888888",
        displayName: "Bob Engineer",
        avatarUrl: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      shareAmount: "42.7500000",
      status: "pending",
    },
  ],
};

const mockSettlement: Settlement = {
  id: "stl-1",
  groupId: "grp-1",
  fromUserId: "usr-bob",
  from: {
    id: "usr-bob",
    stellarPublicKey: "GBOB888888888888888888888888888888888888888888888888888888",
    displayName: "Bob Engineer",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  toUserId: "usr-alice",
  to: {
    id: "usr-alice",
    stellarPublicKey: "GALICE7777777777777777777777777777777777777777777777777777",
    displayName: "Alice Developer",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  amount: "42.7500000",
  assetCode: "USDC",
  assetIssuer: null,
  stellarTxHash: "deadbeefcafebabe12345678",
  status: "confirmed",
  memo: "SETTLE-OCT24-REF-992",
  expenseId: "exp-1",
  createdAt: "2024-10-24T19:30:00.000Z",
};

describe("Transaction History Filtering by Memo & Participant (#715)", () => {
  const expenseRow = toHistoryRow({ type: "expense", ...mockExpense });
  const settlementRow = toHistoryRow({ type: "settlement", ...mockSettlement });
  const allRows = [expenseRow, settlementRow];

  it("filters transactions by memo string in keyword search (case-insensitive)", () => {
    // Exact memo
    const match1 = filterHistoryRows(allRows, { keyword: "BERLIN-DINNER-OCT24" });
    expect(match1).toHaveLength(1);
    expect(match1[0].id).toBe("exp-1");

    // Case-insensitive substring
    const match2 = filterHistoryRows(allRows, { keyword: "berlin-dinner" });
    expect(match2).toHaveLength(1);
    expect(match2[0].id).toBe("exp-1");

    // Settlement memo
    const match3 = filterHistoryRows(allRows, { keyword: "settle-oct24" });
    expect(match3).toHaveLength(1);
    expect(match3[0].id).toBe("stl-1");
  });

  it("filters transactions by participant Stellar public key address", () => {
    // Search by Alice's public key
    const matchAliceAddr = filterHistoryRows(allRows, {
      participant: "GALICE7777777777777777777777777777777777777777777777777777",
    });
    expect(matchAliceAddr).toHaveLength(2);

    // Search by Bob's public key prefix
    const matchBobAddr = filterHistoryRows(allRows, {
      participant: "GBOB8888",
    });
    expect(matchBobAddr).toHaveLength(2);

    // Unrelated address returns 0
    const noMatch = filterHistoryRows(allRows, {
      participant: "GUNKNOWN999999999",
    });
    expect(noMatch).toHaveLength(0);
  });

  it("filters transactions by participant display name", () => {
    const matchAlice = filterHistoryRows(allRows, { participant: "Alice Developer" });
    expect(matchAlice).toHaveLength(2);

    const matchBob = filterHistoryRows(allRows, { participant: "bob engineer" });
    expect(matchBob).toHaveLength(2);
  });

  it("handles empty results gracefully when filter criteria have no match", () => {
    const emptyResult = filterHistoryRows(allRows, {
      keyword: "non-existent-memo-xyz",
    });
    expect(emptyResult).toHaveLength(0);
  });

  it("HistoryFilterBar renders search and participant address controls with working callbacks", () => {
    const onChange = vi.fn();
    const filters: HistoryFilters = { kind: "all" };

    render(<HistoryFilterBar value={filters} onChange={onChange} />);

    // Search input for memo and keyword
    const searchInput = screen.getByLabelText(/search history/i);
    expect(searchInput).toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: "BERLIN-DINNER" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "BERLIN-DINNER" })
    );

    // Participant name / address input
    const participantInput = screen.getByLabelText(/filter by participant/i);
    expect(participantInput).toBeInTheDocument();
    fireEvent.change(participantInput, { target: { value: "GALICE7777" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ participant: "GALICE7777" })
    );
  });
});
