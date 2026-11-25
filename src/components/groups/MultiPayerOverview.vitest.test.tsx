import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MultiPayerOverview } from "./MultiPayerOverview";
import type { Expense, User } from "@/lib/types";

const ada: User = {
  id: "u1",
  stellarPublicKey: "GADA",
  displayName: "Ada",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
};
const ben: User = { ...ada, id: "u2", displayName: "Ben" };

function expense(id: string, payer: User, amount: string, assetCode: string): Expense {
  return {
    id,
    groupId: "g1",
    payerUserId: payer.id,
    payer,
    title: id,
    description: null,
    amount,
    assetCode,
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
    shares: [],
  };
}

describe("MultiPayerOverview", () => {
  it("summarizes each payer separately by asset", () => {
    render(
      <MultiPayerOverview
        expenses={[
          expense("e1", ada, "10", "XLM"),
          expense("e2", ada, "4.5", "XLM"),
          expense("e3", ada, "3", "USDC"),
          expense("e4", ben, "8", "XLM"),
        ]}
      />
    );

    const adaRow = screen.getByText("Ada").closest("li");
    expect(adaRow).not.toBeNull();
    expect(within(adaRow as HTMLElement).getByText("3 expenses")).toBeInTheDocument();
    expect(within(adaRow as HTMLElement).getByText("XLM paid")).toBeInTheDocument();
    expect(within(adaRow as HTMLElement).getByText("USDC paid")).toBeInTheDocument();
    expect(screen.getByText("Ben").closest("li")).toHaveTextContent("1 expense");
  });

  it("renders a quiet empty state when there are no expenses", () => {
    render(<MultiPayerOverview expenses={[]} />);
    expect(screen.getByText("No expenses to summarize yet.")).toBeInTheDocument();
  });
});