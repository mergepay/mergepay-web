/**
 * #892 — inline expense editing on the card fires the optimistic update
 * mutation with only the changed fields, and validates before sending.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseCard } from "./expense-card";
import type { Expense, User } from "@/lib/types";

const mutate = vi.fn();

vi.mock("@/hooks/useExpenseMutations", () => ({
  useUpdateExpenseMutation: () => ({ mutate, isPending: false }),
}));

vi.mock("@/components/FiatEquivalent", () => ({
  FiatEquivalent: () => null,
  FiatInline: () => null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ME: User = {
  id: "me",
  stellarPublicKey: "GME",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
};

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    groupId: "g1",
    payerUserId: "me",
    payer: ME,
    title: "Groceries",
    description: "Weekly shop",
    amount: "10",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2024-05-01T00:00:00.000Z",
    shares: [],
    ...overrides,
  };
}

function renderCard(e: Expense, currentUserId = "me") {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ExpenseCard expense={e} groupId="g1" currentUserId={currentUserId} members={[]} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /expand expense/i }));
}

beforeEach(() => mutate.mockReset());

describe("ExpenseCard inline edit", () => {
  it("sends only the changed fields and closes the form immediately", () => {
    renderCard(expense());
    fireEvent.click(screen.getByRole("button", { name: 'Edit expense "Groceries"' }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Groceries + snacks" } });
    fireEvent.change(screen.getByLabelText("Memo"), { target: { value: "MP:food" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mutate).toHaveBeenCalledWith({
      expenseId: "exp-1",
      data: { title: "Groceries + snacks", memo: "MP:food" },
    });
    expect(screen.queryByRole("form", { name: /edit expense/i })).toBeNull();
  });

  it("does not call the API when nothing changed", () => {
    renderCard(expense());
    fireEvent.click(screen.getByRole("button", { name: /edit expense/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("blocks an empty title or malformed memo with an inline error", () => {
    renderCard(expense());
    fireEvent.click(screen.getByRole("button", { name: /edit expense/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Ok" } });
    fireEvent.change(screen.getByLabelText("Memo"), { target: { value: "not a memo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/MP:<code>/);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("hides Edit for non-payers and while a save is pending", () => {
    renderCard(expense(), "someone-else");
    expect(screen.queryByRole("button", { name: /edit expense/i })).toBeNull();
  });

  it("shows a Saving… badge for a pending edit", () => {
    renderCard(expense({ pending: true }));
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit expense/i })).toBeNull();
  });
});
