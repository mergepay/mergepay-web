/**
 * Issue #607 — Zod schema validation for expense creation.
 *
 * Pins that the submit button is disabled while the form is invalid, enabled
 * once all required fields are filled, and that inline error messages appear
 * after the user attempts submission with bad data.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GroupMember } from "@/lib/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const mutateAsync = vi.fn().mockResolvedValue({ expense: { id: "e1" } });

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

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, createExpense: vi.fn(), uploadReceipt: vi.fn() },
  };
});

import { AddExpenseDialog } from "./add-expense-dialog";

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

const BOB: GroupMember = {
  id: "m-bob",
  groupId: "g1",
  userId: "user-bob",
  role: "member",
  joinedAt: "2026-01-01T00:00:00.000Z",
  user: {
    id: "user-bob",
    stellarPublicKey: "GBOB",
    displayName: "Bob",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
} as unknown as GroupMember;

function renderDialog(members: GroupMember[] = [ALICE, BOB]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AddExpenseDialog
        open
        onClose={vi.fn()}
        groupId="g1"
        members={members}
        currentUserId="user-alice"
      />
    </QueryClientProvider>
  );
}

function submitButton(): HTMLButtonElement {
  return screen.getByTestId("add-expense-confirm") as HTMLButtonElement;
}

describe("AddExpenseDialog — submit button disabled by Zod validation (#607)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is disabled on first render when title and amount are empty", () => {
    renderDialog();
    expect(submitButton()).toBeDisabled();
  });

  it("remains disabled when only the title is filled", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Dinner" },
    });
    expect(submitButton()).toBeDisabled();
  });

  it("remains disabled when only the amount is filled", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "50" },
    });
    expect(submitButton()).toBeDisabled();
  });

  it("becomes enabled once title and amount are both valid", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Dinner" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "50" },
    });
    expect(submitButton()).not.toBeDisabled();
  });

  it("goes back to disabled when the amount is cleared after being valid", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Lunch" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "20" },
    });
    expect(submitButton()).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "" },
    });
    expect(submitButton()).toBeDisabled();
  });

  it("is disabled when a zero amount is entered", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Coffee" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "0" },
    });
    expect(submitButton()).toBeDisabled();
  });

  it("is disabled when there are no participants", () => {
    // Render with empty member list so shares is empty
    renderDialog([]);
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Solo expense" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "30" },
    });
    expect(submitButton()).toBeDisabled();
  });

  it("is disabled when the title is whitespace-only", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "25" },
    });
    expect(submitButton()).toBeDisabled();
  });
});

describe("AddExpenseDialog — inline validation errors shown on submit attempt (#607)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows title error after submitting with empty title", () => {
    renderDialog();
    // Only fill amount, leave title empty
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "40" },
    });
    // The button is disabled when title is empty, so we trigger touch manually
    fireEvent.blur(screen.getByLabelText(/^title$/i));
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });

  it("shows amount error when zero is entered and field is blurred", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "0" },
    });
    fireEvent.blur(screen.getByLabelText(/^amount$/i));
    expect(
      screen.getByText(/greater than zero/i)
    ).toBeInTheDocument();
  });

  it("shows an aria-invalid amount field when the amount is zero", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "0" },
    });
    fireEvent.blur(screen.getByLabelText(/^amount$/i));
    expect(screen.getByLabelText(/^amount$/i)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("does not show errors before any field is touched", () => {
    renderDialog();
    // No interactions — no errors should be visible
    expect(screen.queryByText(/title is required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/amount is required/i)).not.toBeInTheDocument();
  });
});

describe("AddExpenseDialog — Zod schema covers currency/asset selection (#607)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps button enabled when switching from XLM to USDC with valid data", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Groceries" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "80" },
    });
    // Switch currency
    fireEvent.change(screen.getByLabelText(/^asset$/i), {
      target: { value: "USDC" },
    });
    expect(submitButton()).not.toBeDisabled();
  });

  it("shows an inline error and rejects an unsupported asset symbol", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Groceries" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "80" },
    });
    const asset = screen.getByLabelText(/^asset$/i);
    fireEvent.change(asset, { target: { value: "EUR" } });
    fireEvent.blur(asset);

    await waitFor(() => expect(asset).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent(/supported assets|asset code is required/i);
    expect(submitButton()).toBeDisabled();

    fireEvent.submit(document.querySelector("form")!);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("runs resolver validation even when an invalid form is submitted directly", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Coffee" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "0" },
    });

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(screen.getByText(/greater than zero/i)).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("disables during submission and ignores duplicate submit events", async () => {
    let finishRequest: (() => void) | undefined;
    mutateAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRequest = () => resolve({ expense: { id: "e1" } });
        })
    );
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Lunch" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), {
      target: { value: "20" },
    });

    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(submitButton()).toBeDisabled();

    fireEvent.submit(form);
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => finishRequest?.());
  });
});
