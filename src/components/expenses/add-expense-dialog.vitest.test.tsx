import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupMember } from "@/lib/types";

// Mutable connectivity + queue handles shared with the hoisted module mocks.
const offline = vi.hoisted(() => ({
  isOnline: true,
  enqueue: vi.fn(),
}));

const mutateAsync = vi.hoisted(() => vi.fn());
const onClose = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

// The remaining imports of the dialog are unused in its markup; stub them so
// the test never pulls in their transitive dependencies.
vi.mock("@/components/ui/receipt-uploader", () => ({
  ReceiptUploader: () => null,
}));
vi.mock("@/components/expenses/AssetSelector", () => ({
  AssetSelector: () => null,
}));

vi.mock("@/lib/queries", () => ({
  useCreateExpense: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/lib/wallet-store", () => ({
  useWalletDisconnected: () => false,
}));

vi.mock("@/lib/useLocalStorageDraft", () => ({
  useLocalStorageDraft: () => ({
    draft: null,
    isRestored: false,
    saveDraft: vi.fn(),
    clearDraft: vi.fn(),
    acknowledgeRestored: vi.fn(),
  }),
}));

vi.mock("@/lib/store/offlineStore", () => ({
  useOfflineStore: Object.assign(
    (selector: (state: { isOnline: boolean }) => unknown) =>
      selector({ isOnline: offline.isOnline }),
    { getState: () => ({ enqueue: offline.enqueue }) }
  ),
}));

vi.mock("@/lib/api", () => ({
  api: { uploadReceipt: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { AddExpenseDialog } from "./add-expense-dialog";

const member: GroupMember = {
  id: "m1",
  groupId: "g1",
  userId: "u1",
  role: "admin",
  joinedAt: "2026-01-01T00:00:00.000Z",
  user: {
    id: "u1",
    stellarPublicKey: "GALICE",
    displayName: "Alice",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

function renderDialog() {
  return render(
    <AddExpenseDialog
      open
      onClose={onClose}
      groupId="g1"
      members={[member]}
      currentUserId="u1"
    />
  );
}

function fillValidForm(title: string, amount: string) {
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: title },
  });
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: amount },
  });
}

describe("AddExpenseDialog offline queueing", () => {
  beforeEach(() => {
    offline.isOnline = true;
    offline.enqueue.mockReset();
    mutateAsync.mockReset();
    onClose.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("queues the expense in the offline store instead of posting it", async () => {
    offline.isOnline = false;
    renderDialog();
    fillValidForm("Dinner", "30");

    fireEvent.click(screen.getByRole("button", { name: /save offline/i }));

    await waitFor(() => expect(offline.enqueue).toHaveBeenCalled());
    expect(offline.enqueue).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({
        title: "Dinner",
        amount: "30",
        payerUserId: "u1",
      })
    );
    // The request never leaves the device while offline.
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("posts with an idempotency key when online", async () => {
    mutateAsync.mockResolvedValue({ expense: { id: "e1" } });
    renderDialog();
    fillValidForm("Lunch", "12.5");

    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0][0] as { idempotencyKey?: string };
    expect(typeof payload.idempotencyKey).toBe("string");
    expect(payload.idempotencyKey?.length ?? 0).toBeGreaterThan(0);
    expect(offline.enqueue).not.toHaveBeenCalled();
  });
});
