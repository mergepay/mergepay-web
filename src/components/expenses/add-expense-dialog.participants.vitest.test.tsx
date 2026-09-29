import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { AddExpenseDialog } from "./add-expense-dialog";
import type { GroupMember } from "@/lib/types";

/**
 * Who an expense is split between is decided before the group's members have
 * necessarily arrived: the dialog mounts with the page, while the group query
 * is still pending, so its participant list starts out empty. These cases pin
 * the hand-off — the roster is adopted when it lands, a draft's own selection
 * outranks it, and a group with no roster at all is refused rather than posted
 * as an expense nobody owes.
 */

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mutateAsync = vi.fn().mockResolvedValue({ expense: {} });

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

/** `null` behaves like "no draft"; an object is the restored-draft case. */
let restoredDraft: Record<string, unknown> | null = null;

vi.mock("@/lib/useLocalStorageDraft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/useLocalStorageDraft")>()),
  useLocalStorageDraft: () => ({
    draft: restoredDraft,
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

function member(id: string, displayName: string): GroupMember {
  return {
    id: `member-${id}`,
    groupId: "group-1",
    userId: id,
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: { id, displayName, avatarUrl: null },
  } as unknown as GroupMember;
}

const ADA = member("user-a", "Ada");
const BEN = member("user-b", "Ben");

function dialog(members: GroupMember[]): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
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

function fillAmountAndTitle() {
  fireEvent.change(screen.getByLabelText(/^title$/i), {
    target: { value: "Dinner" },
  });
  fireEvent.change(screen.getByLabelText(/^amount$/i), {
    target: { value: "90" },
  });
}

async function submit() {
  // The mocked mutation resolves on a microtask, so the dialog's
  // `setSubmitting(false)` would otherwise land after the test ends.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^add expense$/i }));
  });
}

describe("AddExpenseDialog — participant selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoredDraft = null;
  });

  it("splits across the members that arrive after the dialog mounted", async () => {
    const view = render(dialog([]));
    // What the group page does on a cold load: re-render with the roster.
    view.rerender(dialog([ADA, BEN]));

    fillAmountAndTitle();
    await submit();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      amount: "90",
      splitType: "equal",
      shares: [{ userId: "user-a" }, { userId: "user-b" }],
    });
    // …and the preview the user confirms against names both of them.
    expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ben").length).toBeGreaterThan(0);
  });

  it("keeps the selection a draft restored instead of re-seeding the roster", async () => {
    restoredDraft = { title: "Rent", amount: "40", participants: ["user-b"] };
    render(dialog([ADA, BEN]));

    await submit();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0].shares).toEqual([{ userId: "user-b" }]);
  });

  it("refuses to post when the group has no roster at all", async () => {
    render(dialog([]));

    fillAmountAndTitle();
    await submit();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/select at least one participant/i).length
    ).toBeGreaterThan(0);
  });
});
