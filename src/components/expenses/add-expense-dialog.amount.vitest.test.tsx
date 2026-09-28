/**
 * Issue #520 — the expense dialog's money fields must refuse a keystroke that
 * cannot form a Stellar amount, *before* it reaches state, and explain
 * themselves inline once the value is final.
 *
 * The rules themselves live in `src/lib/expenseValidation.ts` and are unit
 * tested there; what this file pins is the wiring: that the inputs actually
 * consult them, that the rejected input leaves the previous value in place, and
 * that the error is announced to the field it belongs to (`aria-invalid` +
 * `aria-describedby` + a `role="alert"` message), which is the part a pure unit
 * test cannot see.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddExpenseDialog } from "./add-expense-dialog";
import type { GroupMember } from "@/lib/types";

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

const members: GroupMember[] = [
  {
    id: "member-a",
    groupId: "group-1",
    userId: "user-a",
    role: "admin",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: { id: "user-a", displayName: "Ada", avatarUrl: null },
  },
  {
    id: "member-b",
    groupId: "group-1",
    userId: "user-b",
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: { id: "user-b", displayName: "Ben", avatarUrl: null },
  },
] as unknown as GroupMember[];

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

/** The expense amount input, addressed by the id its label points at. */
function amountInput(): HTMLInputElement {
  return document.getElementById("expense-amount") as HTMLInputElement;
}

function fiatInput(): HTMLInputElement {
  return screen.getByLabelText(/foreign currency amount/i) as HTMLInputElement;
}

function rateInput(): HTMLInputElement {
  return screen.getByLabelText(/manual conversion rate/i) as HTMLInputElement;
}

function applyButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^apply$/i }) as HTMLButtonElement;
}

describe("AddExpenseDialog — amount input typing rules (#520)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a plain decimal amount", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "12.5" } });
    expect(amountInput()).toHaveValue("12.5");
  });

  it("keeps every way-station on the way to a decimal", () => {
    renderDialog();
    for (const partial of ["", "5", "5.", ".5", "0.0000001"]) {
      fireEvent.change(amountInput(), { target: { value: partial } });
      expect(amountInput()).toHaveValue(partial);
    }
  });

  it("leaves the previous value in place when a sub-stroop amount is typed", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "2" } });
    fireEvent.change(amountInput(), { target: { value: "2.00000009" } });
    expect(amountInput()).toHaveValue("2");
  });

  it("refuses a pasted negative, exponent or separator", () => {
    renderDialog();
    for (const junk of ["-5", "1e5", "1,000", "$5", "5abc"]) {
      fireEvent.change(amountInput(), { target: { value: junk } });
      expect(amountInput()).toHaveValue("");
    }
  });

  it("blocks the exponent and sign keys before they reach the field", () => {
    renderDialog();
    for (const key of ["e", "E", "+", "-"]) {
      expect(fireEvent.keyDown(amountInput(), { key })).toBe(false);
    }
    expect(fireEvent.keyDown(amountInput(), { key: "5" })).toBe(true);
  });

  it("reports an unusable amount inline, once the value cannot recover", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "0.0000000" } });
    fireEvent.blur(amountInput());

    expect(amountInput()).toHaveAttribute("aria-invalid", "true");
    expect(amountInput()).toHaveAttribute("aria-describedby", "expense-amount-error");
    expect(document.getElementById("expense-amount-error")).toHaveTextContent(/greater than zero/i);
  });

  it("leaves a valid amount alone once the field is committed", () => {
    renderDialog();
    fireEvent.change(amountInput(), { target: { value: "12.5" } });
    fireEvent.blur(amountInput());
    expect(amountInput()).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById("expense-amount-error")).toBeNull();
  });
});

describe("AddExpenseDialog — currency converter inputs (#520)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies the same keystroke rules to the local amount", () => {
    renderDialog();
    fireEvent.change(fiatInput(), { target: { value: "-1000" } });
    expect(fiatInput()).toHaveValue("");
    fireEvent.change(fiatInput(), { target: { value: "1000" } });
    expect(fiatInput()).toHaveValue("1000");
    expect(fireEvent.keyDown(fiatInput(), { key: "e" })).toBe(false);
  });

  it("applies them to the manual rate too", () => {
    renderDialog();
    fireEvent.change(rateInput(), { target: { value: "0.5" } });
    expect(rateInput()).toHaveValue("0.5");
    fireEvent.change(rateInput(), { target: { value: "0.5.5" } });
    expect(rateInput()).toHaveValue("0.5");
  });

  it("converts with the manual rate and applies the result to the amount", () => {
    renderDialog();
    fireEvent.change(fiatInput(), { target: { value: "10" } });
    fireEvent.change(rateInput(), { target: { value: "0.5" } });
    fireEvent.click(applyButton());
    // 10 local currency at 0.5 each is 5 of the group's asset.
    expect(amountInput()).toHaveValue("5");
  });

  it("disables Apply for a zero local amount and explains the field", () => {
    renderDialog();
    fireEvent.change(fiatInput(), { target: { value: "0.0000000" } });
    expect(fiatInput()).toHaveAttribute("aria-invalid", "true");
    expect(fiatInput()).toHaveAttribute("aria-describedby", "fiat-amount-error");
    expect(document.getElementById("fiat-amount-error")).toHaveTextContent(/greater than zero/i);
    expect(applyButton()).toBeDisabled();
  });

  it("falls back to the indicative rate instead of computing with a broken one", () => {
    renderDialog();
    // A rate that parses as a number but cannot be a rate (zero) must not turn
    // the preview into "0 XLM" or make Apply usable.
    fireEvent.change(fiatInput(), { target: { value: "10" } });
    fireEvent.change(rateInput(), { target: { value: "0.0000000" } });
    expect(rateInput()).toHaveAttribute("aria-describedby", "conversion-rate-error");
    expect(document.getElementById("conversion-rate-error")).toHaveTextContent(/greater than zero/i);
  });
});
