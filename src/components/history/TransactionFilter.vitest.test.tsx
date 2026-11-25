import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  TransactionFilter,
  type AssetFilter,
  type StatusFilter,
} from "./TransactionFilter";
import {
  filterHistoryRows,
  toHistoryRow,
  type HistoryRow,
} from "@/lib/historyFilter";
import type { Expense, Settlement } from "@/lib/types";

describe("TransactionFilter Component (#718)", () => {
  it("renders filter bar with search input, asset group, and status group", () => {
    render(
      <TransactionFilter
        selectedAsset="ALL"
        onAssetChange={vi.fn()}
        selectedStatus="ALL"
        onStatusChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
      />
    );

    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /filter by asset type/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /filter by settlement status/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by title, memo or participant/i)).toBeInTheDocument();
  });

  it("allows selecting asset filters (ALL, XLM, USDC) (#718)", () => {
    const onAssetChange = vi.fn();
    render(
      <TransactionFilter
        selectedAsset="ALL"
        onAssetChange={onAssetChange}
        selectedStatus="ALL"
        onStatusChange={vi.fn()}
      />
    );

    const xlmBtn = screen.getByRole("button", { name: "XLM" });
    const usdcBtn = screen.getByRole("button", { name: "USDC" });

    fireEvent.click(xlmBtn);
    expect(onAssetChange).toHaveBeenCalledWith("XLM");

    fireEvent.click(usdcBtn);
    expect(onAssetChange).toHaveBeenCalledWith("USDC");
  });

  it("allows selecting settlement status filters (ALL, PENDING, SETTLED) (#718)", () => {
    const onStatusChange = vi.fn();
    render(
      <TransactionFilter
        selectedAsset="ALL"
        onAssetChange={vi.fn()}
        selectedStatus="ALL"
        onStatusChange={onStatusChange}
      />
    );

    const pendingBtn = screen.getByRole("button", { name: "PENDING" });
    const settledBtn = screen.getByRole("button", { name: "SETTLED" });

    fireEvent.click(pendingBtn);
    expect(onStatusChange).toHaveBeenCalledWith("PENDING");

    fireEvent.click(settledBtn);
    expect(onStatusChange).toHaveBeenCalledWith("SETTLED");
  });

  it("calls onSearchChange when entering query in search box (#718)", () => {
    const onSearchChange = vi.fn();
    render(
      <TransactionFilter
        selectedAsset="ALL"
        onAssetChange={vi.fn()}
        selectedStatus="ALL"
        onStatusChange={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
      />
    );

    const input = screen.getByRole("textbox", { name: /search transactions/i });
    fireEvent.change(input, { target: { value: "dinner" } });
    expect(onSearchChange).toHaveBeenCalledWith("dinner");
  });

  it("shows clear filters button when active and invokes onReset (#718)", () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <TransactionFilter
        selectedAsset="ALL"
        onAssetChange={vi.fn()}
        selectedStatus="ALL"
        onStatusChange={vi.fn()}
        onReset={onReset}
      />
    );

    expect(screen.queryByRole("button", { name: /reset all filters/i })).not.toBeInTheDocument();

    rerender(
      <TransactionFilter
        selectedAsset="USDC"
        onAssetChange={vi.fn()}
        selectedStatus="ALL"
        onStatusChange={vi.fn()}
        onReset={onReset}
      />
    );

    const clearBtn = screen.getByRole("button", { name: /reset all filters/i });
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(onReset).toHaveBeenCalled();
  });

  it("accurately filters transactions by asset and status using filterHistoryRows (#718)", () => {
    const sampleRows: HistoryRow[] = [
      {
        type: "expense",
        id: "e1",
        createdAt: "2024-03-01T10:00:00.000Z",
        assetCode: "USDC",
        status: "pending",
        searchText: "Lunch with team",
        participants: ["Alice", "Bob"],
      },
      {
        type: "expense",
        id: "e2",
        createdAt: "2024-03-02T10:00:00.000Z",
        assetCode: "XLM",
        status: "settled",
        searchText: "Coffee split",
        participants: ["Alice", "Charlie"],
      },
      {
        type: "settlement",
        id: "s1",
        createdAt: "2024-03-03T10:00:00.000Z",
        assetCode: "USDC",
        status: "settled",
        searchText: "Settle Lunch",
        participants: ["Bob", "Alice"],
      },
    ];

    // Filter by asset USDC
    const usdcRows = filterHistoryRows(sampleRows, { assetCode: "USDC" });
    expect(usdcRows).toHaveLength(2);
    expect(usdcRows.map((r) => r.id)).toEqual(["e1", "s1"]);

    // Filter by asset XLM
    const xlmRows = filterHistoryRows(sampleRows, { assetCode: "XLM" });
    expect(xlmRows).toHaveLength(1);
    expect(xlmRows[0].id).toBe("e2");

    // Filter by status pending
    const pendingRows = filterHistoryRows(sampleRows, { status: "pending" });
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0].id).toBe("e1");

    // Filter by status settled
    const settledRows = filterHistoryRows(sampleRows, { status: "settled" });
    expect(settledRows).toHaveLength(2);
    expect(settledRows.map((r) => r.id)).toEqual(["e2", "s1"]);

    // Combined filter: USDC + settled
    const usdcSettled = filterHistoryRows(sampleRows, { assetCode: "USDC", status: "settled" });
    expect(usdcSettled).toHaveLength(1);
    expect(usdcSettled[0].id).toBe("s1");
  });
});
