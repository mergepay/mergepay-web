import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { signXdr } from "@/lib/stellar";
import { NETWORK_PASSPHRASE } from "@/lib/constants";
import { buildSettlementPaymentXdr } from "@/lib/stellar/transactions";
import type { SettleTarget } from "@/lib/useSettlementFlow";
import type { Settlement } from "@/lib/types";
import { SettlementModal, type SettlementModalProps } from "./SettlementModal";

const mutateAsync = vi.fn();
const trustlineCheckMock = vi.fn();

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

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
  useSettlementCacheRefresh: () => vi.fn(),
}));

vi.mock("@/components/wallet/TrustlineBanner", () => ({
  TrustlineBanner: ({
    asset,
  }: {
    asset?: { code: string; issuer: string | null };
  }) => (
    <div data-testid="trustline-banner">
      {asset ? `${asset.code}:${asset.issuer}` : "missing asset"}
    </div>
  ),
}));

vi.mock("@/lib/settlement/trustline", () => ({
  verifyTrustlineBeforeSettlement: (...args: unknown[]) => trustlineCheckMock(...args),
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
const issuer = Keypair.random().publicKey();
const MEMO = "MP:rent-0526";

const target: SettleTarget = {
  to: { id: "user-2", stellarPublicKey: recipient, displayName: "Taylor", avatarUrl: null, createdAt: "2026-01-01T00:00:00Z" },
  amount: "10",
  assetCode: "XLM",
  assetIssuer: null,
  label: "Settle up with Taylor",
};

const issuedTarget: SettleTarget = {
  ...target,
  assetCode: "USDC",
  assetIssuer: issuer,
};

function xdrWith(
  memo: string,
  destination = recipient,
  amount = "10",
  assetCode = "XLM",
  assetIssuer: string | null = null
) {
  return buildSettlementPaymentXdr({
    source: { publicKey: payer, sequence: "2" },
    destination,
    amount,
    assetCode,
    assetIssuer,
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

// Built once per test on purpose: buildSettlementPaymentXdr() stamps the
// envelope with Math.floor(Date.now() / 1000), so two builds a second apart are
// not equal (see the time-bounds guard in __tests__/transactions.test.ts).
let capturedIntent: ReturnType<typeof intent>;

describe("SettlementModal", () => {
  let currentIntent: ReturnType<typeof intent>;

  beforeEach(() => {
    capturedIntent = intent();
    trustlineCheckMock.mockReset().mockResolvedValue(true);
    vi.mocked(api.createSettlement).mockResolvedValue(capturedIntent);
    vi.mocked(signXdr).mockImplementation(async (xdr: string) => xdr);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts on the review step", () => {
    renderModal();
    expect(screen.getByText("Taylor")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Settlement progress" }).querySelector("[aria-current=step]")).toHaveTextContent("Review");
  });

  it("checks the selected non-XLM asset before settling", () => {
    const issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    renderModal({ target: { ...target, assetCode: "USDC", assetIssuer: issuer } });

    expect(screen.getByTestId("trustline-banner")).toHaveTextContent(`USDC:${issuer}`);
  });

  it("warns and blocks settlement when the recipient is missing the trustline", async () => {
    trustlineCheckMock.mockResolvedValue(false);
    renderModal({ target: issuedTarget });

    expect(await screen.findByTestId("trustline-warning")).toHaveTextContent(
      "Taylor needs an active USDC trustline"
    );
    expect(trustlineCheckMock).toHaveBeenCalledWith(recipient, "USDC", issuer);
    expect(screen.getByRole("button", { name: /confirm & sign/i })).toBeDisabled();
    expect(api.createSettlement).not.toHaveBeenCalled();
    expect(signXdr).not.toHaveBeenCalled();
  });

  it("rechecks the recipient trustline before opening Freighter", async () => {
    trustlineCheckMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const issuedIntent = intent(MEMO, xdrWith(MEMO, recipient, "10", "USDC", issuer));
    vi.mocked(api.createSettlement).mockResolvedValue(issuedIntent);
    renderModal({ target: issuedTarget });

    const confirmButton = screen.getByRole("button", { name: /confirm & sign/i });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    expect(await screen.findByTestId("trustline-warning")).toBeInTheDocument();
    expect(api.createSettlement).toHaveBeenCalledTimes(1);
    expect(signXdr).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
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
    expect(signXdr).toHaveBeenCalledWith(capturedIntent.xdr, NETWORK_PASSPHRASE);
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      settlementId: "stl-1",
      data: { signedXdr: capturedIntent.xdr },
      optimisticTransfer: expect.objectContaining({
        fromUserId: "user-1",
        toUserId: "user-2",
        amount: "10.0000000",
        assetCode: "XLM",
      }),
    }));
    expect(screen.getByTestId("memo-badge")).toHaveTextContent("rent-0526");
    expect(screen.getByTestId("memo-badge")).toHaveAttribute("data-severity", "none");
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ status: "confirmed" }));
    expect(toast.success).toHaveBeenCalledWith("Settled on Stellar");
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("signs the envelope captured before the clock moved on", async () => {
    // The regression this guards: the old assertion rebuilt the envelope with
    // `xdrWith(MEMO)` at assertion time, so it only matched while both builds
    // landed in the same wall-clock second. Pin the clock a few seconds past
    // the capture — a rebuild, whether in the test or in the modal, is now
    // guaranteed to carry a different time bound and fail here deterministically
    // instead of flaking in CI. Only `Date` is faked so the real-time sign and
    // confirm deadlines still expire as the other tests expect.
    const later = Date.now() + 3000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(later);

    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement)
      .mockResolvedValueOnce({ settlement: settlement("submitted") })
      .mockResolvedValue({ settlement: settlement("confirmed") });
    renderModal();

    confirmAndSign();

    expect(await screen.findByText("Settled!")).toBeInTheDocument();
    expect(signXdr).toHaveBeenCalledWith(capturedIntent.xdr, NETWORK_PASSPHRASE);
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      settlementId: "stl-1",
      data: { signedXdr: capturedIntent.xdr },
      optimisticTransfer: expect.objectContaining({
        fromUserId: "user-1",
        toUserId: "user-2",
        amount: "10.0000000",
        assetCode: "XLM",
      }),
    }));
  });

  it("handles the user rejecting the signature", async () => {
    vi.mocked(signXdr).mockRejectedValue(Object.assign(new Error("declined"), { code: "user_rejected" }));
    renderModal();

    confirmAndSign();

    expect(await screen.findByText("Signature declined")).toBeInTheDocument();
    expect(screen.getByText(/Nothing was submitted/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
    // Declining is a warning, not an error, and nothing was sent.
    expect(toast.warning).toHaveBeenCalledWith(
      "Signature declined",
      expect.objectContaining({ description: expect.stringContaining("Nothing was sent"), id: "settlement-failure" })
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("times out when the wallet never answers", async () => {
    vi.mocked(signXdr).mockReturnValue(new Promise(() => undefined));
    renderModal({ timeouts: { ...fast, sign: 20 } });

    confirmAndSign();

    expect(await screen.findByText("Timed out")).toBeInTheDocument();
    expect(screen.getByText(/Freighter didn't respond/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    // Timed out before anything was signed: a warning that does not suggest a payment is in flight.
    expect(toast.warning).toHaveBeenCalledWith(
      "Timed out",
      expect.objectContaining({ description: expect.stringContaining("Freighter didn't respond") })
    );
    expect(toast.warning).not.toHaveBeenCalledWith(
      "Timed out",
      expect.objectContaining({ description: expect.stringContaining("may still go through") })
    );
  });

  it("offers a status check, not a second payment, after a network timeout", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("submitted") });
    vi.mocked(api.getSettlement).mockResolvedValue({ settlement: settlement("submitted") });
    renderModal({ timeouts: { ...fast, confirm: 30 } });

    confirmAndSign();

    expect(await screen.findByText("Timed out")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    // The signed payment already reached Mergepay, so the toast says it may still confirm.
    expect(toast.warning).toHaveBeenCalledWith(
      "Timed out",
      expect.objectContaining({ description: expect.stringContaining("may still go through") })
    );

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
    expect(toast.error).toHaveBeenCalledWith("Payment details don't match", expect.objectContaining({ id: "settlement-failure" }));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("allows a fresh attempt when Stellar rejects the payment", async () => {
    mutateAsync.mockResolvedValue({ settlement: settlement("failed") });
    renderModal();

    confirmAndSign();

    expect(await screen.findByText("Payment failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Payment failed",
      expect.objectContaining({ description: "Stellar rejected this payment. No funds moved.", id: "settlement-failure" })
    );
    expect(toast.success).not.toHaveBeenCalled();
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
    // The user cancelled; they do not need a toast about their own choice.
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
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

  it("switches to QR code payment method and displays payment QR code", async () => {
    renderModal();

    const qrToggle = screen.getByRole("button", { name: /scan qr/i });
    expect(qrToggle).toBeInTheDocument();

    fireEvent.click(qrToggle);

    expect(screen.getByTestId("payment-qr-container")).toBeInTheDocument();
    expect(screen.getByText(/Scan with any Stellar mobile wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy payment uri to clipboard/i })).toBeInTheDocument();
  });
});

