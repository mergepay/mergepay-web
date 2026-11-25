import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApiRequestError, api } from "@/lib/api";
import { signXdr } from "@/lib/stellar";
import type { HorizonFallbackState } from "@/hooks/useHorizonConfirmationFallback";
import { SettleDialog, type SettleTarget } from "./settle-dialog";

/**
 * The settle dialog's Horizon polling fallback (#814): when the Mergepay API is
 * slow to report a signed payment's outcome — or the submit request is lost
 * after signing — the dialog reads the result from Horizon instead of leaving
 * the user on a spinner or inviting a second, duplicate payment.
 */

const SIGNED_HASH = "a".repeat(64);

const mutateAsync = vi.fn();
const refreshCaches = vi.fn();
const statusQuery = {
  data: undefined as { status: string; stellarTxHash?: string | null } | undefined,
  pollingStalled: false,
  pollingTimedOut: false,
  restartPolling: vi.fn(),
  refetch: vi.fn(),
};

const horizon = {
  state: { status: "idle", attempts: 0 } as HorizonFallbackState,
  restart: vi.fn(),
  lastOptions: null as null | { txHash: string | null; enabled: boolean },
};

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => true };
});

vi.mock("@/lib/queries", () => ({
  useConfirmSettlement: () => ({ mutateAsync }),
  useSettlementStatus: () => statusQuery,
  useSettlementCacheRefresh: () => refreshCaches,
}));

vi.mock("@/hooks/useHorizonConfirmationFallback", () => ({
  useHorizonConfirmationFallback: (options: { txHash: string | null; enabled: boolean }) => {
    horizon.lastOptions = options;
    return { state: horizon.state, restart: horizon.restart };
  },
}));

vi.mock("@/lib/stellar/transactions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar/transactions")>(
    "@/lib/stellar/transactions"
  );
  return { ...actual, transactionHashFromXdr: vi.fn(() => SIGNED_HASH) };
});

vi.mock("@/lib/stellar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar")>("@/lib/stellar");
  return { ...actual, signXdr: vi.fn().mockResolvedValue("signed-xdr") };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, createSettlement: vi.fn(), settleExpense: vi.fn() } };
});

vi.mock("@/hooks/useWalletStatus", () => ({
  useWalletStatus: () => ({
    kind: "connected",
    label: "Connected",
    message: "Connected to Testnet.",
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

const pending = { settlement: { ...intent.settlement, stellarTxHash: null, status: "submitted" } };

function renderDialog() {
  return render(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);
}

const settleNow = () => fireEvent.click(screen.getByRole("button", { name: /settle now/i }));

describe("SettleDialog Horizon confirmation fallback (#814)", () => {
  beforeEach(() => {
    vi.mocked(api.createSettlement).mockResolvedValue(intent as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    statusQuery.data = undefined;
    statusQuery.pollingStalled = false;
    statusQuery.pollingTimedOut = false;
    horizon.state = { status: "idle", attempts: 0 };
    horizon.lastOptions = null;
  });

  it("arms the fallback with the signed envelope's hash once the payment is submitted", async () => {
    mutateAsync.mockResolvedValue(pending);
    renderDialog();
    expect(horizon.lastOptions).toEqual({ txHash: null, enabled: false });

    settleNow();
    expect(await screen.findByText("Waiting for confirmation")).toBeInTheDocument();
    expect(horizon.lastOptions).toEqual({ txHash: SIGNED_HASH, enabled: true });
  });

  it("tells the user it is checking Stellar directly while Horizon is polled", async () => {
    mutateAsync.mockResolvedValue(pending);
    horizon.state = { status: "polling", attempts: 2 };
    renderDialog();
    settleNow();

    expect(await screen.findByText(/checking Stellar directly/i)).toBeInTheDocument();
  });

  it("confirms from Horizon when the API is still pending, then refreshes the group", async () => {
    mutateAsync.mockResolvedValue(pending);
    const view = renderDialog();
    settleNow();
    expect(await screen.findByText("Waiting for confirmation")).toBeInTheDocument();

    horizon.state = { status: "confirmed", ledger: 123, attempts: 3 };
    view.rerender(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);

    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    // The locally derived hash is what the receipt links to.
    expect(screen.getAllByText(new RegExp(SIGNED_HASH.slice(0, 6))).length).toBeGreaterThan(0);
    expect(toast.success).toHaveBeenCalledWith("Settled on Stellar");
    expect(refreshCaches).toHaveBeenCalledTimes(1);
  });

  it("fails the settlement when Horizon reports the transaction unsuccessful", async () => {
    mutateAsync.mockResolvedValue(pending);
    const view = renderDialog();
    settleNow();
    expect(await screen.findByText("Waiting for confirmation")).toBeInTheDocument();

    horizon.state = { status: "failed", error: "tx_failed", attempts: 1 };
    view.rerender(<SettleDialog open onClose={vi.fn()} groupId="group-1" target={target} />);

    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
  });

  it("waits on the chain instead of failing when the submit request is lost after signing", async () => {
    mutateAsync.mockRejectedValue(new ApiRequestError(504, "GATEWAY_TIMEOUT", "Gateway timed out"));
    renderDialog();
    settleNow();

    expect(await screen.findByText("Waiting for confirmation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/checking Stellar directly/i));
    expect(toast.error).not.toHaveBeenCalled();
    expect(horizon.lastOptions).toEqual({ txHash: SIGNED_HASH, enabled: true });
  });

  it("still fails fast on a definite API rejection (4xx) after signing", async () => {
    mutateAsync.mockRejectedValue(new ApiRequestError(422, "INVALID_XDR", "Envelope rejected"));
    renderDialog();
    settleNow();

    expect(await screen.findByText("Envelope rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("keeps waiting while Horizon is still checking, even if API polling has stalled", async () => {
    mutateAsync.mockResolvedValue(pending);
    statusQuery.pollingStalled = true;
    horizon.state = { status: "polling", attempts: 4 };
    renderDialog();
    settleNow();

    expect(await screen.findByText("Waiting for confirmation")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't check status")).not.toBeInTheDocument();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("offers a fresh check of both sources once API and Horizon have both given up", async () => {
    mutateAsync.mockResolvedValue(pending);
    statusQuery.pollingTimedOut = true;
    horizon.state = { status: "timed_out", attempts: 9 };
    renderDialog();
    settleNow();

    expect(await screen.findByText("Still waiting for confirmation")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /check status/i }));
    });
    expect(statusQuery.restartPolling).toHaveBeenCalledTimes(1);
    expect(horizon.restart).toHaveBeenCalledTimes(1);
    // Checking again never builds or signs a second payment.
    expect(api.createSettlement).toHaveBeenCalledTimes(1);
    expect(signXdr).toHaveBeenCalledTimes(1);
  });
});
