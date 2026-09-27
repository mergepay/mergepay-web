import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { api } from "@/lib/api";
import { signXdr } from "@/lib/stellar";
import { NETWORK_PASSPHRASE } from "@/lib/constants";
import { buildSettlementPaymentXdr } from "@/lib/stellar/transactions";
import type { SettleTarget } from "@/lib/useSettlementFlow";
import type { Settlement } from "@/lib/types";
import { SettlementModal, type SettlementModalProps } from "./SettlementModal";

const mutateAsync = vi.fn();

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    // jsdom has no matchMedia and never finishes exit animations.
    useReducedMotion: () => true,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("@/lib/queries", () => ({
  useConfirmSettlement: () => ({ mutateAsync }),
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

// `src/types/declarations.d.ts` shims the SDK types without `Keypair`.
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

function xdrWith(memo: string, destination = recipient, amount = "10") {
  return buildSettlementPaymentXdr({
    source: { publicKey: payer, sequence: "2" },
    destination,
    amount,
    assetCode: "XLM",
    assetIssuer: null,
    memo,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
}

function settlement(status: Settlement["status"], memo: string | null = MEMO): Settlement {
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
    stellarTxHash: status === "confirmed" ? "a".repeat(64) : null,
    status,
    memo,
    expenseId: null,
    createdAt: "2026-09-27T10:00:00Z",
  };
}

function intent(memo = MEMO, xdr = xdrWith(MEMO)) {
  return { settlement: { ...settlement("pending"), memo }, xdr, networkPassphrase: NETWORK_PASSPHRASE };
}

const fast = { prepare: 1000, sign: 1000, submit: 1000, confirm: 1000, pollInterval: 1 };

function renderModal(props: Partial<SettlementModalProps> = {}) {
  const onClose = vi.fn();
  const onSettled = vi.fn();
  render(<SettlementModal open onClose={onClose} onSettled={onSettled} groupId="g1" target={target} timeouts={fast} {...props} />);
  return { onClose, onSettled };
}

const confirmAndSign = () => fireEvent.click(screen.getByRole("button", { name: /confirm & sign/i }));

describe("SettlementModal", () => {
  beforeEach(() => {
    vi.mocked(api.createSettlement).mockResolvedValue(intent());
    vi.mocked(signXdr).mockImplementation(async (xdr: string) => xdr);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts on the review step", () => {
    renderModal();
    expect(screen.getByText("Taylor")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Settlement progress" }).querySelector("[aria-current=step]")).toHaveTextContent("Review");
  });

  it("verifies the memo, signs, submits and shows success", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement)
      .mockResolvedValueOnce({ settlement: settlement("submitted") })
      .mockResolvedValue({ settlement: settlement("confirmed") });
    const { onSettled } = renderModal();

    confirmAndSign();

    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(api.createSettlement).toHaveBeenCalledWith("g1", { toUserId: "user-2", amount: "10", assetCode: "XLM", assetIssuer: null });
    expect(signXdr).toHaveBeenCalledWith(xdrWith(MEMO), NETWORK_PASSPHRASE);
    expect(mutateAsync).toHaveBeenCalledWith({ settlementId: "stl-1", data: { signedXdr: intent().xdr } });
    expect(screen.getByTestId("memo-badge")).toHaveTextContent("rent-0526");
    expect(screen.getByTestId("memo-badge")).toHaveAttribute("data-severity", "none");
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ status: "confirmed" }));
  });

  it("handles the user rejecting the signature", async () => {
    vi.mocked(signXdr).mockRejectedValue(Object.assign(new Error("declined"), { code: "user_rejected" }));
    renderModal();

    confirmAndSign();

    expect(await screen.findByText("Signature declined")).toBeInTheDocument();
    expect(screen.getByText(/Nothing was submitted/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });

  it("times out when the wallet never answers", async () => {
    vi.mocked(signXdr).mockReturnValue(new Promise(() => undefined));
    renderModal({ timeouts: { ...fast, sign: 20 } });

    confirmAndSign();

    expect(await screen.findByText("Timed out")).toBeInTheDocument();
    expect(screen.getByText(/Freighter didn't respond/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("offers a status check, not a second payment, after a network timeout", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement).mockResolvedValue({ settlement: settlement("submitted") });
    renderModal({ timeouts: { ...fast, confirm: 30 } });

    confirmAndSign();

    expect(await screen.findByText("Timed out")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();

    vi.mocked(api.getSettlement).mockResolvedValue({ settlement: settlement("confirmed") });
    fireEvent.click(screen.getByRole("button", { name: /check status/i }));

    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(api.createSettlement).toHaveBeenCalledTimes(1);
    expect(signXdr).toHaveBeenCalledTimes(1);
  });

  it("refuses to sign when the envelope memo differs from the settlement memo", async () => {
    vi.mocked(api.createSettlement).mockResolvedValue(intent(MEMO, xdrWith("MP:something-else")));
    renderModal();

    confirmAndSign();

    expect(await screen.findByText("Payment details don't match")).toBeInTheDocument();
    expect(screen.getByText(/does not match the expected "MP:rent-0526"/)).toBeInTheDocument();
    expect(signXdr).not.toHaveBeenCalled();
  });

  it("refuses to sign a payment to the wrong recipient", async () => {
    vi.mocked(api.createSettlement).mockResolvedValue(intent(MEMO, xdrWith(MEMO, Keypair.random().publicKey())));
    renderModal();

    confirmAndSign();

    expect(await screen.findByText(/not addressed to the member/)).toBeInTheDocument();
    expect(signXdr).not.toHaveBeenCalled();
  });

  it("does not show success when the confirmed memo does not match", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("confirmed", "MP:tampered") });
    renderModal();

    confirmAndSign();

    expect(await screen.findByText("Payment details don't match")).toBeInTheDocument();
    expect(screen.queryByText("Settled!")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again|check status/i })).not.toBeInTheDocument();
  });

  it("allows a fresh attempt when Stellar rejects the payment", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("failed") });
    renderModal();

    confirmAndSign();

    expect(await screen.findByText("Payment failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("cancels cleanly while waiting for the wallet", async () => {
    let resolveSign: (xdr: string) => void = () => undefined;
    vi.mocked(signXdr).mockReturnValue(new Promise((resolve) => (resolveSign = resolve)));
    const { onClose } = renderModal();

    confirmAndSign();
    expect(await screen.findByText("Check your wallet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();

    resolveSign(intent().xdr);
    await new Promise((r) => setTimeout(r, 10));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("cannot be dismissed while the payment is being submitted", async () => {
    mutateAsync.mockReturnValue(new Promise(() => undefined));
    const { onClose } = renderModal({ timeouts: { ...fast, submit: 10_000 } });

    confirmAndSign();
    expect(await screen.findByText("Submitting to Stellar")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("Submitting to Stellar")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
