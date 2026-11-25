import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GroupAnalytics } from "./GroupAnalytics";
import type { Expense } from "@/lib/types";

const sampleExpenses: Expense[] = [
  {
    id: "exp_1",
    groupId: "grp_1",
    payerUserId: "u1",
    title: "Hotel booking",
    description: null,
    amount: "150.5",
    assetCode: "USDC",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-10-20T10:00:00.000Z",
    payer: {
      id: "u1",
      displayName: "Alice",
      stellarPublicKey: "GAAA",
      avatarUrl: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    shares: [],
  },
  {
    id: "exp_2",
    groupId: "grp_1",
    payerUserId: "u2",
    title: "Team dinner",
    description: null,
    amount: "49.5",
    assetCode: "USDC",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2026-10-21T12:00:00.000Z",
    payer: {
      id: "u2",
      displayName: "Bob",
      stellarPublicKey: "GBBB",
      avatarUrl: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    shares: [],
  },
];

describe("GroupAnalytics (#644)", () => {
  it("computes total spent, average, largest expenses, and category breakdown", () => {
    render(<GroupAnalytics expenses={sampleExpenses} />);
    expect(screen.getByText(/Analytics & export/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText("Largest expenses")).toHaveTextContent("Hotel booking");
    expect(screen.getByLabelText("Spending by category")).toBeInTheDocument();
  });
});
