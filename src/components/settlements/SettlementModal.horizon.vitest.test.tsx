import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { toast } from "sonner";
import { ApiRequestError, api } from "@/lib/api";
import { signXdr } from "@/lib/stellar";
import { NETWORK_PASSPHRASE } from "@/lib/constants";
import { buildSettlementPaymentXdr, transactionHashFromXdr } from "@/lib/stellar/transactions";
import type { TransactionStatusResponse } from "@/lib/transactionStatusPolling";
import type { SettleTarget } from "@/lib/useSettlementFlow";
import type { Settlement } from "@/lib/types";
import { SettlementModal, type SettlementModalProps } from "./SettlementModal";

/**
 * The settle-up modal's Horizon polling fallback (#814): while the Mergepay API
 * is slow to confirm — or after the submit request is lost — the modal reads
 * the outcome straight from Horizon instead of stranding the user.
 */

const mutateAsync = vi.fn();
const refreshCaches = vi.fn();

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    useReducedMotion: () => true,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("@/lib/queries", () => ({
  useConfirmSettlement: () => ({ mutateAsync }),
  useSettlementCacheRefresh: () => refreshCaches,
}));

vi.mock("@/components/wallet/TrustlineBanner", () => ({ TrustlineBanner: () => null }));

vi.mock("@/lib/settlement/trustline", () => ({
  verifyTrustlineBeforeSettlement: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/stellar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar")>("@/lib/stellar");
  return { ...actual, signXdr: vi.fn() };
});

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { ...actual.api, createSettlement: vi.fn(), settleExpense: vi.fn(), getSettlement: vi.fn() },
  };
});

vi.mock("@/hooks/useWalletStatus", () => ({
  useWalletStatus: () => ({
    kind: "connected",
    label: "Connected",
    message: "Connected",
    actionLabel: null,
    actionKind: null,
    tone: "lime",
    canSign: true,
    address: "GPAYER",
    networkName: "TESTNET",
    refresh: vi.fn(),
  }),
}));

const { Keypair } = StellarSdk as unknown as { Keypair: { random(): { publicKey(): string } } };
const payer = Keypair.random().publicKey();
const recipient = Keypair.random().publicKey();
const MEMO = "MP:rent-0526";

const target: SettleTarget = {
  to: { id: "user-2", stellarPublicKey: recipient, displayName: "Taylor", avatarUrl: null, createdAt: "2026-01-01T00:00:00Z" },
  amount: "10",
  assetCode: "XLM",
  assetIssuer: null,
  label: "Settle up with Taylor",
};

function settlement(status: Settlement["status"], hash: string | null = null): Settlement {
  return {
    id: "stl-1",
    groupId: "g1",
    fromUserId: "user-1",
    from: target.to,
    toUserId: "user-2",
    to: target.to,
    amount: "10.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    stellarTxHash: hash,
    status,
    memo: MEMO,
    expenseId: null,
    createdAt: "2026-09-27T10:00:00Z",
  };
}

let xdr: string;
let hash: string;

/** A Horizon stand-in answering each probe from a script. */
function horizonProbe(...script: TransactionStatusResponse["status"][]) {
  let call = 0;
  return vi.fn(async (txHash: string): Promise<TransactionStatusResponse> => {
    const status = script[Math.min(call++, script.length - 1)];
    return { status, txHash, ledger: status === "success" ? 777 : undefined };
  });
}

// Short real-time budgets: grace 20ms, first probe interval 10ms.
const fast = { prepare: 1000, sign: 1000, submit: 1000, confirm: 1500, pollInterval: 5 };

function renderModal(props: Partial<SettlementModalProps> = {}) {
  const onSettled = vi.fn();
  render(
    <SettlementModal open onClose={vi.fn()} onSettled={onSettled} groupId="g1" target={target} timeouts={fast} {...props} />
  );
  return { onSettled };
}

const confirmAndSign = () => fireEvent.click(screen.getByRole("button", { name: /confirm & sign/i }));

describe("SettlementModal Horizon confirmation fallback (#814)", () => {
  beforeEach(() => {
    xdr = buildSettlementPaymentXdr({
      source: { publicKey: payer, sequence: "2" },
      destination: recipient,
      amount: "10",
      assetCode: "XLM",
      assetIssuer: null,
      memo: MEMO,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    hash = transactionHashFromXdr(xdr, NETWORK_PASSPHRASE) as string;
    vi.mocked(api.createSettlement).mockResolvedValue({
      settlement: settlement("pending"),
      xdr,
      networkPassphrase: NETWORK_PASSPHRASE,
    });
    vi.mocked(signXdr).mockImplementation(async (envelope: string) => envelope);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("derives a real hash from the envelope under test", () => {
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("confirms from Horizon while the API keeps reporting the payment as pending", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement).mockResolvedValue({ settlement: settlement("submitted") });
    const probe = horizonProbe("pending", "pending", "success");
    const { onSettled } = renderModal({ horizonFallback: { graceMs: 20, initialIntervalMs: 10, probe } });

    confirmAndSign();

    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(probe).toHaveBeenCalledWith(hash, expect.any(AbortSignal));
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ status: "confirmed", stellarTxHash: hash }));
    expect(refreshCaches).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Settled on Stellar");
  });

  it("lets the API win when it confirms first, without touching Horizon", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement).mockResolvedValue({ settlement: settlement("confirmed", "b".repeat(64)) });
    const probe = horizonProbe("success");
    const { onSettled } = renderModal({ horizonFallback: { graceMs: 500, probe } });

    confirmAndSign();

    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ stellarTxHash: "b".repeat(64) }));
    expect(probe).not.toHaveBeenCalled();
    expect(refreshCaches).not.toHaveBeenCalled();
  });

  it("reports a payment Horizon marks unsuccessful as failed, allowing a fresh attempt", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement).mockResolvedValue({ settlement: settlement("submitted") });
    const probe = horizonProbe("failed");
    renderModal({ horizonFallback: { graceMs: 20, probe } });

    confirmAndSign();

    expect(await screen.findByText("Payment failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("waits on the chain instead of failing when the submit request is lost after signing", async () => {
    mutateAsync.mockRejectedValue(new ApiRequestError(503, "UNAVAILABLE", "Service unavailable"));
    vi.mocked(api.getSettlement).mockRejectedValue(new ApiRequestError(503, "UNAVAILABLE", "Service unavailable"));
    const probe = horizonProbe("pending", "success");
    renderModal({ horizonFallback: { graceMs: 20, initialIntervalMs: 10, probe } });

    confirmAndSign();

    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/checking Stellar directly/i));
    expect(toast.error).not.toHaveBeenCalled();
    // Waiting never re-submits.
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(signXdr).toHaveBeenCalledTimes(1);
  });

  it("still fails fast on a definite API rejection after signing", async () => {
    mutateAsync.mockRejectedValue(new ApiRequestError(422, "INVALID_XDR", "Envelope rejected"));
    const probe = horizonProbe("success");
    renderModal({ horizonFallback: { graceMs: 20, probe } });

    confirmAndSign();

    expect(await screen.findByText("Envelope rejected")).toBeInTheDocument();
    expect(probe).not.toHaveBeenCalled();
  });

  it("offers a status check when neither the API nor Horizon has an answer in time", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement).mockResolvedValue({ settlement: settlement("submitted") });
    const probe = horizonProbe("pending");
    renderModal({ timeouts: { ...fast, confirm: 120 }, horizonFallback: { graceMs: 20, initialIntervalMs: 10, probe } });

    confirmAndSign();

    expect(await screen.findByText("Timed out")).toBeInTheDocument();
    expect(probe).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /check status/i })).toBeInTheDocument();

    // "Check status" re-runs both legs — and Horizon now has it.
    probe.mockResolvedValue({ status: "success", txHash: hash, ledger: 9 });
    fireEvent.click(screen.getByRole("button", { name: /check status/i }));
    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(api.createSettlement).toHaveBeenCalledTimes(1);
  });

  it("can be switched off", async () => {
    mutateAsync.mockRejectedValue(new ApiRequestError(503, "UNAVAILABLE", "Service unavailable"));
    renderModal({ horizonFallback: false });

    confirmAndSign();

    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
  });
});
