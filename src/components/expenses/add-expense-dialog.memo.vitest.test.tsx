import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddExpenseDialog } from "./add-expense-dialog";
import type { GroupMember } from "@/lib/types";
import { validateMergepayMemo } from "@/lib/validations/memo";

/**
 * The memo field is validated by `expenseFormSchema` and surfaced through the
 * dialog's generic `fieldErrors` map. These cases pin the wiring: the Zod
 * message reaches the DOM, and it only appears once the user has interacted
 * with the field (or attempted a submit).
 */

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  useCreateExpense: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
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
    isRestored: true,
    saveDraft: vi.fn(),
    clearDraft: vi.fn(),
    acknowledgeRestored: vi.fn(),
  }),
}));

vi.mock("@/lib/store/offlineStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/offlineStore")>()),
  useOfflineStore: () => ({ isOnline: true, pendingCount: 0 }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, createExpense: vi.fn(), uploadReceipt: vi.fn() },
  };
});

function member(id: string, displayName: string, role: "admin" | "member") {
  return {
    id: `member-${id}`,
    groupId: "group-1",
    userId: id,
    role,
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: { id, displayName, avatarUrl: null },
  } as unknown as GroupMember;
}

const members: GroupMember[] = [
  member("user-a", "Ada", "admin"),
  member("user-b", "Ben", "member"),
];

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AddExpenseDialog
        open
        onClose={vi.fn()}
        groupId="group-1"
        members={members}
        currentUserId="user-a"
      />
    </QueryClientProvider>
  );
}

/** The memo input, labelled "Memo (optional)". */
function memoInput(): HTMLInputElement {
  return screen.getByLabelText(/memo \(optional\)/i) as HTMLInputElement;
}

/**
 * The hint/error text tied to the memo input. Located by the id the input
 * points at with `aria-describedby` rather than by role — the dialog has
 * other `role="alert"` regions (the split preview, the offline notice) that
 * have nothing to do with the memo.
 */
function memoMessage(): HTMLElement | null {
  return document.getElementById("expense-memo-hint");
}

describe("AddExpenseDialog — memo field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an optional memo field with the expected format hint", () => {
    renderDialog();
    const input = memoInput();
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-describedby", "expense-memo-hint");
    expect(memoMessage()?.textContent).toMatch(
      /letters, numbers, hyphens, or underscores/i
    );
  });

  it("shows no error before the field is touched", () => {
    renderDialog();
    fireEvent.change(memoInput(), { target: { value: "not a memo" } });
    expect(memoInput()).not.toHaveAttribute("aria-invalid");
    expect(memoMessage()?.textContent).not.toMatch(/must start with/i);
  });

  it("shows an inline error for a malformed memo on blur", () => {
    renderDialog();
    const input = memoInput();
    fireEvent.change(input, { target: { value: "dinner 1a2b" } });
    fireEvent.blur(input);

    const message = memoMessage();
    expect(message?.textContent).toBe(validateMergepayMemo("dinner 1a2b").error);
    expect(message).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("points out a missing MP: prefix specifically", () => {
    renderDialog();
    const input = memoInput();
    fireEvent.change(input, { target: { value: "dinner-1a2b" } });
    fireEvent.blur(input);

    expect(memoMessage()?.textContent).toMatch(/start with "MP:"/);
  });

  it("accepts a well-formed memo with no error", () => {
    renderDialog();
    const input = memoInput();
    fireEvent.change(input, { target: { value: "MP:dinner-1a2b" } });
    fireEvent.blur(input);

    expect(input).not.toHaveAttribute("aria-invalid");
    expect(memoMessage()?.textContent).toMatch(/letters, numbers, hyphens/i);
  });

  it("accepts underscores in the reconciliation code", () => {
    renderDialog();
    const input = memoInput();
    fireEvent.change(input, { target: { value: "MP:dinner_8f3a" } });
    fireEvent.blur(input);

    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("rejects a memo over the 28-byte limit", () => {
    renderDialog();
    const input = memoInput();
    const tooLong = `MP:${"a".repeat(26)}`;
    fireEvent.change(input, { target: { value: tooLong } });
    fireEvent.blur(input);

    expect(memoMessage()?.textContent).toMatch(/29 bytes/);
  });

  it("recovers the hint once the memo is corrected", () => {
    renderDialog();
    const input = memoInput();
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.blur(input);
    expect(memoMessage()).toHaveAttribute("role", "alert");

    fireEvent.change(input, { target: { value: "MP:dinner-1a2b" } });
    fireEvent.blur(input);

    expect(memoMessage()).not.toHaveAttribute("role", "alert");
    expect(memoMessage()?.textContent).toMatch(/letters, numbers, hyphens/i);
  });
});
