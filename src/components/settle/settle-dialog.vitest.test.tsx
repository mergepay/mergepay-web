import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApiRequestError, api } from "@/lib/api";
import { UserRejectedError, WalletError, signXdr } from "@/lib/stellar";
import { SettleDialog, type SettleTarget } from "./settle-dialog";

const mutateAsync = vi.fn();
const statusQuery: {
  data: { status: string; stellarTxHash?: string | null } | undefined;
  pollingStalled: boolean;
  pollingTimedOut: boolean;
  restartPolling: ReturnType<typeof vi.fn>;
  refetch: ReturnType<typeof vi.fn>;
} = {
  data: undefined,
  pollingStalled: false,
  pollingTimedOut: false,
  restartPolling: vi.fn(),
  refetch: vi.fn(),
};

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  // jsdom has no matchMedia, which the progress components read.
  return { ...actual, useReducedMotion: () => true };
});

vi.mock("@/lib/queries", () => ({
  useConfirmSettlement: () => ({ mutateAsync }),
  useSettleExpense: () => ({ mutateAsync }),
  useSettlementStatus: () => statusQuery,
  useSettlementCacheRefresh: () => vi.fn(),
}));

vi.mock("@/lib/stellar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar")>("@/lib/stellar");
  return { ...actual, signXdr: vi.fn().mockResolvedValue("signed-xdr") };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      createSettlement: vi.fn(),
      settleExpense: vi.fn(),
    },
  };
});

// The wallet-gating added in #176 disables "Settle now" until the wallet is
// connected, on the right network, and ready to sign. These tests exercise the
// settlement state machine, not wallet readiness, so present a connected wallet.
vi.mock("@/hooks/useWalletStatus", () => ({
  useWalletStatus: () => ({
    kind: "connected",
    label: "Connected",
    message: "Connected to Testnet. Mergepay never sees your keys.",
    actionLabel: null,
    actionKind: null,
    tone: "lime",
    canSign: true,
    address: "GUSER1",
    networkName: "TESTNET",
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/wallet-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wallet-store")>("@/lib/wallet-store");
  return { ...actual, useWalletDisconnected: () => false };
});

const target: SettleTarget = {
  to: {
    id: "user-2",
    stellarPublicKey: "GUSER2",
    displayName: "Taylor",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  amount: "10",
  assetCode: "XLM",
  assetIssuer: null,
  label: "Settle up with Taylor",
};

const intent = {
  settlement: { id: "settlement-1" },
  xdr: "unsigned-xdr",
  networkPassphrase: "Test SDF Network ; September 2015",
};

const settlement = {
  ...intent.settlement,
  stellarTxHash: "tx-hash",
  status: "confirmed",
};

/** The step the progress bar marks as current. */
const currentStep = () =>
  screen.getByRole("list", { name: "Settlement progress" }).querySelector("[aria-current=step]");

const settleNow = () => fireEvent.click(screen.getByRole("button", { name: /settle now/i }));

describe("SettleDialog state transitions", () => {
  beforeEach(() => {
    vi.mocked(signXdr).mockResolvedValue("signed-xdr");
  });

  afterEach(() => {
    vi.clearAllMocks();
    statusQuery.data = undefined;
    statusQuery.pollingStalled = false;
    statusQuery.pollingTimedOut = false;
  });

  it("moves from review through signing/submitting to done", async () => {
    vi.mocked(api.createSettlement).mockResolvedValue(intent as never);
    // Hold confirmation open so the dialog is observably parked on "submitting"
    // before we complete it — otherwise the pre-resolved mocks race straight to
    // the done step and the intermediate state is never rendered.
    let confirmSettlement!: () => void;
    mutateAsync.mockReturnValue(
      new Promise((resolve) => {
        confirmSettlement = () => resolve({ settlement });
      }),
    );

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    expect(screen.getByRole("button", { name: /settle now/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /settle now/i }));
    expect(await screen.findByText(/submitting to stellar/i)).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent("Sign");

    confirmSettlement();
    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent("Done");
    expect(toast.success).toHaveBeenCalledWith("Settled on Stellar");
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("surfaces the API message in the failed step when confirmation fails", async () => {
    const message = "The settlement could not be confirmed";
    vi.mocked(api.createSettlement).mockResolvedValue(intent as never);
    mutateAsync.mockRejectedValue(new ApiRequestError(502, "UPSTREAM", message));

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    fireEvent.click(screen.getByRole("button", { name: /settle now/i }));

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("SettleDialog final-result toasts", () => {
  beforeEach(() => {
    vi.mocked(signXdr).mockResolvedValue("signed-xdr");
    vi.mocked(api.createSettlement).mockResolvedValue(intent as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    statusQuery.data = undefined;
    statusQuery.pollingStalled = false;
    statusQuery.pollingTimedOut = false;
  });

  it("warns, rather than errors, when the signature is declined in Freighter", async () => {
    vi.mocked(signXdr).mockRejectedValue(new UserRejectedError());

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    settleNow();

    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith(
      "Signature declined",
      expect.objectContaining({ description: expect.stringContaining("Nothing was sent"), id: "settlement-failure" })
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
    // The failure happened while signing, so that is the leg the progress bar marks.
    expect(currentStep()).toHaveTextContent("Sign");
  });

  it("raises an error toast for a wallet problem and keeps the wallet's own wording", async () => {
    vi.mocked(signXdr).mockRejectedValue(new WalletError("Freighter is locked", "locked"));

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    settleNow();

    expect(await screen.findByText("Wallet locked")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Wallet error",
      expect.objectContaining({ description: expect.stringContaining("Freighter is locked") })
    );
  });

  it("names the API failure as a settlement failure, not a wallet error", async () => {
    mutateAsync.mockRejectedValue(new ApiRequestError(502, "UPSTREAM", "The settlement could not be confirmed"));

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    settleNow();

    await screen.findByText("The settlement could not be confirmed");
    expect(toast.error).toHaveBeenCalledWith(
      "Settlement failed",
      expect.objectContaining({
        // The wallet had signed by then, so the toast must not read as "nothing happened".
        description: expect.stringContaining("may still go through"),
      })
    );
  });

  it("raises an error toast when Stellar rejects the payment on submission", async () => {
    mutateAsync.mockResolvedValue({ settlement: { ...settlement, status: "failed", stellarTxHash: null } });

    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    settleNow();

    expect(await screen.findByText("Stellar rejected this transaction. Please try again.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Payment failed",
      expect.objectContaining({ description: "Stellar rejected this payment. No funds moved." })
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(currentStep()).toHaveTextContent("Submit");
  });

  it("raises an error toast when polling later finds the payment failed", async () => {
    mutateAsync.mockResolvedValue({ settlement: { ...settlement, status: "submitted" } });
    const view = render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    settleNow();
    expect(await screen.findByText("Waiting for confirmation")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();

    statusQuery.data = { status: "failed" };
    view.rerender(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);

    expect(await screen.findByText("Stellar rejected this transaction. Please try again.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Payment failed", expect.anything());
  });

  it("shows no toast for an input the user can fix on the spot", async () => {
    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={{ ...target, amount: "0" }} />);
    settleNow();

    // The failed step replaces the review step, which is when the progress bar appears.
    await waitFor(() => expect(screen.queryByRole("button", { name: /settle now/i })).not.toBeInTheDocument());
    expect(api.createSettlement).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(currentStep()).toHaveTextContent("Review");
  });
});

describe("SettleDialog while the status can no longer be read", () => {
  beforeEach(() => {
    vi.mocked(signXdr).mockResolvedValue("signed-xdr");
    vi.mocked(api.createSettlement).mockResolvedValue(intent as never);
    mutateAsync.mockResolvedValue({ settlement: { ...settlement, status: "submitted" } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    statusQuery.data = undefined;
    statusQuery.pollingStalled = false;
    statusQuery.pollingTimedOut = false;
  });

  it("cannot be closed while polling is healthy", async () => {
    const onClose = vi.fn();
    render(<SettleDialog open onClose={onClose} groupId="group-1" target={target} />);
    settleNow();

    expect(await screen.findByText("Waiting for confirmation")).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent("Submit");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets the user leave, and warns once, when status checks stall", async () => {
    statusQuery.pollingStalled = true;
    const onClose = vi.fn();
    render(<SettleDialog open onClose={onClose} groupId="group-1" target={target} />);
    settleNow();

    expect(await screen.findByText("Couldn't check status")).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      "Couldn't check the payment status",
      expect.objectContaining({ description: expect.stringContaining("may still be processing") })
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says the wait ran out, and offers a fresh check, when polling times out", async () => {
    statusQuery.pollingTimedOut = true;
    render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
    settleNow();

    expect(await screen.findByText("Still waiting for confirmation")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't check status")).not.toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith("Still waiting for confirmation", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: /check status/i }));
    expect(statusQuery.restartPolling).toHaveBeenCalledTimes(1);
    expect(statusQuery.refetch).toHaveBeenCalledTimes(1);
    // Checking again must not build or sign a second payment.
    expect(api.createSettlement).toHaveBeenCalledTimes(1);
    expect(signXdr).toHaveBeenCalledTimes(1);
  });
});
