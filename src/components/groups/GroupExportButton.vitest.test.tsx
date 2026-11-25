import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupExportButton } from "./GroupExportButton";
import type { Expense, Settlement, User } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const alice: User = {
  id: "u1",
  stellarPublicKey: "GALICE",
  displayName: "Alice",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};

function makeExpense(): Expense {
  return {
    id: "e1",
    groupId: "g1",
    payerUserId: "u1",
    payer: alice,
    title: "Lunch",
    description: null,
    amount: "25.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-06-15T12:00:00Z",
    shares: [],
  };
}

function makeSettlement(): Settlement {
  return {
    id: "st1",
    groupId: "g1",
    fromUserId: "u1",
    from: alice,
    toUserId: "u1",
    to: alice,
    amount: "25.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    stellarTxHash: "a".repeat(64),
    status: "confirmed",
    memo: null,
    expenseId: null,
    createdAt: "2026-06-16T10:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

describe("GroupExportButton", () => {
  it("renders export button and triggers CSV download dialog", () => {
    render(
      <GroupExportButton
        groupId="g1"
        expenses={[makeExpense()]}
        settlements={[makeSettlement()]}
      />
    );

    const btn = screen.getByRole("button", { name: /export group/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.getByText(/export group data/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /download csv/i }));
  });
});
