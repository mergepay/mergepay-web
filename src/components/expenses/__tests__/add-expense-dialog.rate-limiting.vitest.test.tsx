import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GroupMember } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const mutateAsync = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ expense: { id: "e1" } }), 100)));

vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  useCreateExpense: () => ({
    mutate: vi.fn(),
    mutateAsync,
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock("@/lib/wallet-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wallet-store")>()),
  useWalletDisconnected: () => false,
}));

vi.mock("@/lib/useLocalStorageDraft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/useLocalStorageDraft")>()),
  useLocalStorageDraft: () => ({
    draft: null,
    isRestored: false,
    saveDraft: vi.fn(),
    clearDraft: vi.fn(),
    acknowledgeRestored: vi.fn(),
  }),
}));

vi.mock("@/lib/store/offlineStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/offlineStore")>()),
  useOfflineStore: () => ({ isOnline: true, pendingCount: 0 }),
}));

import { AddExpenseDialog } from "../add-expense-dialog";

const ALICE: GroupMember = {
  id: "m-alice",
  groupId: "g1",
  userId: "user-alice",
  role: "admin",
  joinedAt: "2026-01-01T00:00:00.000Z",
  user: {
    id: "user-alice",
    stellarPublicKey: "GALICE",
    displayName: "Alice",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
} as unknown as GroupMember;

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AddExpenseDialog
        open
        onClose={vi.fn()}
        groupId="g1"
        members={[ALICE]}
        currentUserId="user-alice"
      />
    </QueryClientProvider>
  );
}

describe("AddExpenseDialog — rate limiting and request debouncing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prevents multiple rapid submissions when clicked multiple times", async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Groceries" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "45" },
    });

    const confirmButton = screen.getByTestId("add-expense-confirm");
    expect(confirmButton).not.toBeDisabled();

    // Rapid successive clicks
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
  });
});
