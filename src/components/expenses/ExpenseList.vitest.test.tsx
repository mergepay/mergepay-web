import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseList } from "./ExpenseList";
import type { Expense, ExpenseShare, User } from "@/lib/types";

const ada: User = { id: "u1", stellarPublicKey: "GADA", displayName: "Ada", avatarUrl: null, createdAt: "2026-01-01T00:00:00Z" };

function expense(id: string, title: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    groupId: "g1",
    payerUserId: "u1",
    payer: ada,
    title,
    description: null,
    amount: "10.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-05-10T12:00:00Z",
    shares: [],
    ...overrides,
  };
}

const settledShare: ExpenseShare = {
  id: "s1",
  expenseId: "e2",
  userId: "u1",
  user: ada,
  shareAmount: "10.0000000",
  status: "settled",
};

const expenses = [
  expense("e1", "Dinner"),
  expense("e2", "Taxi", { assetCode: "USDC", shares: [settledShare] }),
  expense("e3", "Groceries", { createdAt: "2026-06-01T12:00:00Z" }),
];

const titles = () => within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent);

describe("ExpenseList", () => {
  it("shows the no-expenses state when the group has none", () => {
    render(<ExpenseList expenses={[]} />);
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  it("filters by keyword", () => {
    render(<ExpenseList expenses={expenses} />);
    fireEvent.change(screen.getByLabelText("Search expenses"), { target: { value: "taxi" } });
    expect(titles()).toEqual([expect.stringContaining("Taxi")]);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 3 expenses");
  });

  it("filters by asset and settlement status", () => {
    render(<ExpenseList expenses={expenses} />);
    fireEvent.change(screen.getByLabelText("Filter by currency"), { target: { value: "XLM" } });
    expect(titles()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Settled" }));
    expect(screen.getByRole("button", { name: "Settled" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No matching expenses")).toBeInTheDocument();
  });

  it("filters by date range", () => {
    render(<ExpenseList expenses={expenses} />);
    fireEvent.change(screen.getByLabelText("Filter from date"), { target: { value: "2026-05-15" } });
    expect(titles()).toEqual([expect.stringContaining("Groceries")]);
    expect(screen.getByLabelText("Filter to date")).toHaveAttribute("min", "2026-05-15");
  });

  it("shows an empty state with a way to clear filters", () => {
    render(<ExpenseList expenses={expenses} />);
    fireEvent.change(screen.getByLabelText("Search expenses"), { target: { value: "hotel" } });
    expect(screen.getByText("No matching expenses")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(titles()).toHaveLength(3);
    expect(screen.getByLabelText("Search expenses")).toHaveValue("");
  });

  it("supports controlled filters so state can live with the owner", () => {
    const onFiltersChange = vi.fn();
    render(<ExpenseList expenses={expenses} filters={{ status: "settled" }} onFiltersChange={onFiltersChange} />);
    expect(titles()).toEqual([expect.stringContaining("Taxi")]);
    fireEvent.click(screen.getByRole("button", { name: /clear \(1\)/i }));
    expect(onFiltersChange).toHaveBeenCalledWith({});
    // Still controlled: nothing changes until the owner passes new filters.
    expect(titles()).toHaveLength(1);
  });

  it("uses a custom row renderer", () => {
    render(<ExpenseList expenses={expenses} hideFilterBar renderExpense={(e) => <span>row:{e.id}</span>} />);
    expect(screen.getByText("row:e1")).toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });
});
