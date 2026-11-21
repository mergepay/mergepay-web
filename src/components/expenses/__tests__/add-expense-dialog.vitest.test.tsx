import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddExpenseDialog } from "../add-expense-dialog";

// Mock dependencies
vi.mock("@/lib/queries", () => ({
  useCreateExpense: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

vi.mock("@/lib/asset-store", () => ({
  useAssetStore: () => ({
    activeAsset: { code: "XLM", issuer: null },
    setActiveAsset: vi.fn(),
  }),
  isActiveAsset: () => true,
}));

vi.mock("@/lib/wallet-store", () => ({
  useWalletDisconnected: () => false,
}));

vi.mock("@/lib/store/offlineStore", () => ({
  useOfflineStore: (selector: any) => selector({ isOnline: true }),
}));

describe("AddExpenseDialog Draft Persistence", () => {
  const mockMembers = [
    {
      id: "m1",
      groupId: "g1",
      userId: "u1",
      role: "admin" as const,
      joinedAt: "2026-01-01T00:00:00Z",
      user: { id: "u1", stellarPublicKey: "G1", displayName: "Alice", avatarUrl: null, createdAt: "2026-01-01T00:00:00Z" },
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders without draft restored banner initially when storage is empty", () => {
    render(
      <AddExpenseDialog
        open={true}
        onClose={() => {}}
        groupId="group-test"
        members={mockMembers}
        currentUserId="u1"
      />
    );
    expect(screen.queryByText(/Restored draft from previous session/i)).toBeNull();
  });

  it("shows recovered draft banner and restores values when draft exists in localStorage", () => {
    localStorage.setItem(
      "mergepay:expense_draft:group-test",
      JSON.stringify({
        title: "Recovered Dinner",
        amount: "75",
        assetKey: "XLM",
        payerUserId: "u1",
        splitType: "equal",
        participants: ["u1"],
        custom: {},
        percent: {},
        memo: "",
      })
    );

    render(
      <AddExpenseDialog
        open={true}
        onClose={() => {}}
        groupId="group-test"
        members={mockMembers}
        currentUserId="u1"
      />
    );

    expect(screen.getByText(/Restored draft from previous session/i)).toBeDefined();
    const titleInput = screen.getByLabelText(/Title/i) as HTMLInputElement;
    expect(titleInput.value).toBe("Recovered Dinner");
  });
});
