import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TreasuryDashboard } from "./TreasuryDashboard";
import * as queries from "@/lib/queries";
import * as stellar from "@/lib/stellar";

vi.mock("@/lib/queries");
vi.mock("@/lib/stellar");
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "usr-1", publicKey: "GAA...123", displayName: "Alice" },
  }),
}));

describe("TreasuryDashboard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(queries, "useGroups").mockReturnValue({
      data: {
        groups: [
          {
            id: "grp-1",
            name: "DAO Treasury",
            description: "Shared fund",
            createdByUserId: "usr-1",
            treasuryEnabled: true,
            treasuryAccountPublicKey: "GTR...456",
            treasuryRequiredSigners: 2,
            archived: false,
            createdAt: "2026-09-01T00:00:00.000Z",
            memberCount: 5,
            yourNet: "0",
            netAssetCode: "USDC",
            yourRole: "admin",
          },
        ],
      },
      isLoading: false,
    } as any);

    vi.spyOn(queries, "useTreasuryInfo").mockReturnValue({
      data: {
        publicKey: "GTR...456",
        balances: [
          { assetCode: "USDC", assetIssuer: "GBB...789", balance: "1500.0000000" },
          { assetCode: "XLM", assetIssuer: null, balance: "250.0000000" },
        ],
        signers: [
          { key: "GAA...123", weight: 1 },
          { key: "GBB...456", weight: 1 },
          { key: "GCC...789", weight: 1 },
        ],
        thresholds: { low: 1, med: 2, high: 3 },
      },
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(queries, "useTreasuryHistory").mockReturnValue({
      data: {
        transactions: [
          {
            id: "tx-pending-1",
            groupId: "grp-1",
            userId: "usr-1",
            user: { id: "usr-1", publicKey: "GAA...123", displayName: "Alice", avatarUrl: null, createdAt: "" },
            direction: "withdrawal",
            amount: "100.0000000",
            assetCode: "USDC",
            assetIssuer: "GBB...789",
            destination: "GDEST...999",
            stellarTxHash: null,
            status: "pending",
            memo: "Grant payout",
            createdAt: "2026-09-28T10:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      refetch: vi.fn(),
    } as any);
  });

  it("renders treasury overview with threshold progress and pending approvals", () => {
    render(<TreasuryDashboard groupId="grp-1" />);

    expect(screen.getByTestId("treasury-dashboard")).toBeInTheDocument();
    expect(screen.getByText("Treasury Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Threshold: 2 of 3 Signatures")).toBeInTheDocument();
    expect(screen.getByText("Approval Queue (1)")).toBeInTheDocument();
    expect(screen.getByText("-100.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 collected")).toBeInTheDocument();
    expect(screen.getByTestId("approve-btn-tx-pending-1")).toBeInTheDocument();
  });

  it("triggers Freighter signing flow on approve button click", async () => {
    const signSpy = vi.spyOn(stellar, "signAndConfirmTreasuryTx").mockResolvedValue({} as any);

    render(<TreasuryDashboard groupId="grp-1" />);
    const approveBtn = screen.getByTestId("approve-btn-tx-pending-1");

    fireEvent.click(approveBtn);
    expect(signSpy).toHaveBeenCalledWith("tx-pending-1", "", expect.any(String));
  });
});
