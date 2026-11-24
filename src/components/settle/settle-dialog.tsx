"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Lock, PenLine, Plug, QrCode, RefreshCcw, Send, ShieldX, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { TxProgress, TxStatusPanel } from "@/components/ui/tx-progress";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { TxLink } from "@/components/tx-link";
import { SettlementConfirmation } from "@/components/settle/settlement-confirmation";
import { MemoBadge } from "@/components/stellar/MemoBadge";
import { PaymentQRCode } from "@/components/ui/PaymentQRCode";
import { cn } from "@/lib/utils";
import { api, ApiRequestError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { connectWallet, signXdr, WalletError, WalletErrorCode, NotInstalledMessage } from "@/lib/stellar";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { WalletPrerequisiteNotice } from "@/components/wallet/wallet-status";
import {
  useConfirmSettlement,
  useSettleExpense,
  useSettlementCacheRefresh,
  useSettlementStatus,
} from "@/lib/queries";
import { classifySettlementError, isAmbiguousSubmissionError, transactionHashFromXdr } from "@/lib/stellar/transactions";
import { useHorizonConfirmationFallback } from "@/hooks/useHorizonConfirmationFallback";
import { notifySettlementFailure, notifySettlementStatusUnknown } from "@/lib/settlementToasts";
import { validateSettlementInput } from "@/lib/paymentValidation";
import {
  createSettlementFormSchema,
  fieldErrorsFrom,
} from "@/lib/validators";
import { recoveryActionFor, retryLabelFor } from "@/lib/settlementRetry";
import { useWalletDisconnected } from "@/lib/wallet-store";
import type { SettlementStep, SettleTarget } from "@/lib/useSettlementFlow";
import type { SettlementSuggestion, User } from "@/lib/types";
import { FeeEstimatorWidget } from "@/components/FeeEstimatorWidget";
import { MemoPreview } from "@/components/settle/MemoPreview";
import { MemoWarningBanner } from "@/components/MemoWarningBanner";
import { verifyTransactionMemo } from "@/lib/memo";
import { generateShortCode, buildSettlementMemo } from "@/lib/memoValidation";
import { TrustlineDetectionBanner } from "@/components/settle/TrustlineDetectionBanner";
import { TrustlinePromptModal, type TrustlineAssetInfo } from "@/components/settle/TrustlinePromptModal";


// The settlement types moved to `@/lib/useSettlementFlow` when the flow was
// extracted into a hook. Re-exported here so existing consumers can keep
// importing them from the dialog.
export type { SettleTarget };

type Step =
  | "review"
  | "submitting"
  | "submitted"
  | "confirmed"
  | "failed";

/** The legs the progress bar shows. Same shape as the settlement modal's. */
const PROGRESS = [
  { id: "review", label: "Review" },
  { id: "sign", label: "Sign" },
  { id: "submit", label: "Submit" },
  { id: "done", label: "Done" },
] as const;

/** Index into {@link PROGRESS} of the leg a failure happened in. */
const FAILED_AT_REVIEW = 0;
const FAILED_AT_SIGNING = 1;
const FAILED_AT_NETWORK = 2;

const STELLAR_REJECTED_MESSAGE = "Stellar rejected this transaction. Please try again.";

/** Classified form of "Stellar accepted the request but refused the payment". */
function stellarRejection() {
  return classifySettlementError(
    Object.assign(new Error("Stellar rejected this payment. No funds moved."), { code: "tx_failed" })
  );
}

// ---------------------------------------------------------------------------
// Step metadata for status cards
// ---------------------------------------------------------------------------

interface StepMeta {
  icon: ReactNode;
  title: string;
  description: string;
}

const STEP_META: Partial<Record<SettlementStep, StepMeta>> = {
  preparing: {
    icon: <Loader2 className="h-7 w-7 animate-spin text-grape" />,
    title: "Preparing payment",
    description: "Building the transaction on Stellar…",
  },
  awaiting_wallet: {
    icon: <Wallet className="h-7 w-7 text-grape" />,
    title: "Check your wallet",
    description:
      "Approve the transaction in your Freighter wallet to continue.",
  },
  submitted: {
    icon: <Loader2 className="h-7 w-7 animate-spin text-grape" />,
    title: "Waiting for confirmation",
    description:
      "Polling the network for the terminal transaction state. You can close this dialog — the ledger will refresh automatically.",
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepLine({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function WalletErrorBanner({
  code,
  message,
}: {
  code: WalletErrorCode | null;
  message: ReactNode;
}) {
  const icon =
    code === "locked" ? (
      <Lock className="h-4 w-4" />
    ) : code === "not_installed" ? (
      <ShieldX className="h-4 w-4" />
    ) : (
      <AlertTriangle className="h-4 w-4" />
    );

  let title = "Error";
  if (code === "locked") title = "Wallet locked";
  else if (code === "not_installed") title = "Wallet not found";
  else if (code === "user_rejected") title = "Cancelled";
  else if (code === "disconnected") title = "Disconnected";
  else if (code === "network") title = "Network error";

  return (
    <div
      className="flex items-start gap-3 rounded-xl border-2 border-ink bg-butter-pale px-4 py-3 text-sm"
      role="alert"
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
        {icon}
      </span>
      <div>
        <p className="font-display text-[11px] uppercase tracking-widest text-ink/50">
          {title}
        </p>
        <p className="mt-1">{message}</p>
      </div>
    </div>
  );
}

export interface BulkSettleTarget {
  expenseIds: string[];
  /** Per-expense informational rows for the dialog (id, title, payer, amount). */
  rows: { expenseId: string; title: string; amount: string }[];
  to: User;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  label: string;
}

export function suggestionToTarget(s: SettlementSuggestion): SettleTarget {
  return {
    to: s.to,
    amount: s.amount,
    assetCode: s.assetCode,
    assetIssuer: s.assetIssuer,
    label: `Settle up with ${s.to.displayName}`,
  };
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function SettleDialog({
  open,
  onClose,
  groupId,
  target,
  bulkTarget,
  onSettled,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  target: SettleTarget | null;
  bulkTarget?: BulkSettleTarget | null;
  /** Fired after a successful bulk settlement so the parent can clear the selection. */
  onSettled?: () => void;
}) {
  const confirm = useConfirmSettlement(groupId);
  const settleExpense = useSettleExpense(groupId);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("review");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | null>(null);
  const [error, setError] = useState<ReactNode>("");
  const [errorCode, setErrorCode] = useState<WalletErrorCode | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [failedAt, setFailedAt] = useState(FAILED_AT_SIGNING);
  const statusQuery = useSettlementStatus(settlementId, step === "submitted", groupId);
  const refreshSettlementCaches = useSettlementCacheRefresh(groupId);
  // Hash of the envelope the wallet signed, derived locally so the outcome can
  // be read straight from Horizon when the API is slow to report it (#814).
  const [signedHash, setSignedHash] = useState<string | null>(null);
  const horizon = useHorizonConfirmationFallback({
    txHash: signedHash,
    enabled: step === "submitted",
  });
  // Still waiting on Horizon: inside the grace period or actively polling.
  const horizonChecking =
    step === "submitted" &&
    Boolean(signedHash) &&
    (horizon.state.status === "idle" || horizon.state.status === "polling");
  // Once status checks have stalled or run out of time — and the direct
  // Horizon check has nothing more to add — the dialog is waiting on nothing it
  // can observe, so the user must be free to leave instead of being held here
  // until a reload. The payment may still confirm; the ledger and history pick
  // it up when it does.
  const statusUnknown =
    step === "submitted" &&
    Boolean(statusQuery.pollingStalled || statusQuery.pollingTimedOut) &&
    !horizonChecking;
  const transactionInFlight = step === "submitting" || (step === "submitted" && !statusUnknown);
  // The settle target lives in props and is never mutated here, so a failed
  // attempt leaves the amount, asset, and recipient intact for the retry.
  const recovery = recoveryActionFor(errorCode);
  const { refresh: refreshWallet, ...wallet } = useWalletStatus();
  // Signing requires the wallet — block new attempts while disconnected.
  const walletDisconnected = useWalletDisconnected();
  // Connectivity belongs in an effect: `navigator.onLine` read during render
  // diverges from the SSR HTML (Node ≥21 exposes a global `navigator` whose
  // `onLine` is undefined) and can break React hydration.
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const isBulk = !!bulkTarget;
  const active = isBulk ? bulkTarget : target;
  const [settleMethod, setSettleMethod] = useState<"wallet" | "qr">("wallet");
  const [editedMemo, setEditedMemo] = useState<string | null>(null);
  const [trustlineModalOpen, setTrustlineModalOpen] = useState(false);
  const [trustlinesReady, setTrustlinesReady] = useState(false);

  // Derive the trustline asset info from the active target
  const trustlineAsset: TrustlineAssetInfo | null = useMemo(() => {
    if (!active || !active.assetIssuer) return null;
    return {
      code: active.assetCode,
      issuer: active.assetIssuer,
      name: active.assetCode,
    };
  }, [active]);

  // Generate a preview memo from the target label and amount
  const previewMemo = useMemo(() => {
    if (!active) return null;
    const targetLabel = isBulk ? bulkTarget?.label ?? "settle-up" : target?.label ?? "settle-up";
    const shortCode = generateShortCode(targetLabel, active.amount);
    return buildSettlementMemo(shortCode);
  }, [active, isBulk, target, bulkTarget]);

  // Track memo deviations when the user edits
  const originalShortCode = useMemo(() => {
    if (!active) return null;
    const targetLabel = isBulk ? bulkTarget?.label ?? "settle-up" : target?.label ?? "settle-up";
    return generateShortCode(targetLabel, active.amount);
  }, [active, isBulk, target, bulkTarget]);

  /** Prevent accidental dismissal while a transaction is in-flight. */
  const dismissible = !transactionInFlight;

  function close() {
    if (transactionInFlight) return;
    onClose();
    // reset after the close animation
    setTimeout(() => {
      setStep("review"); setTxHash(null); setSignedHash(null); setMemo(null); setError(""); setErrorCode(null); setSettlementId(null); setAttempts(0); setReconnecting(false); setFailedAt(FAILED_AT_SIGNING); setSettleMethod("wallet");
    }, 200);
  }

  async function run(options?: { skipWalletGate?: boolean }) {
    if (!target) return;
    // The "Settle now" control is disabled while prerequisites are missing and
    // the notice above it explains what to fix; this guard covers keyboard and
    // programmatic activation. `skipWalletGate` is for callers that have just
    // established the connection themselves — the polled status is still a
    // tick behind at that point and would block a valid attempt.
    if (!options?.skipWalletGate && !wallet.canSign) return;
    const activeMemo = editedMemo ?? previewMemo;
    const memoCheck = verifyTransactionMemo(activeMemo, originalShortCode ?? undefined);
    if (!memoCheck.isValid) {
      setError(memoCheck.message);
      setErrorCode(null);
      setFailedAt(FAILED_AT_REVIEW);
      setStep("failed");
      return;
    }
    // Runtime gate (#339): the settlement input must satisfy the shared Zod
    // schema before the hand-rolled validator — same rules, one source.
    const schemaCheck = createSettlementFormSchema.safeParse({
      toUserId: target.to.id,
      amount: target.amount,
      assetCode: target.assetCode,
      assetIssuer: target.assetIssuer,
    });
    if (!schemaCheck.success) {
      setError(Object.values(fieldErrorsFrom(schemaCheck))[0] ?? "Invalid payment input");
      setErrorCode(null);
      setFailedAt(FAILED_AT_REVIEW);
      setStep("failed");
      return;
    }
    const validation = validateSettlementInput({ amount: target.amount, assetCode: target.assetCode, assetIssuer: target.assetIssuer });
    if (!validation.valid) { setError(validation.error ?? "Invalid payment input"); setErrorCode(null); setFailedAt(FAILED_AT_REVIEW); setStep("failed"); return; }
    // Clear the previous attempt's residue so a retry never shows a stale tx
    // hash or keeps polling the settlement that already failed.
    setError(""); setErrorCode(null); setTxHash(null); setSignedHash(null); setMemo(null); setSettlementId(null); setAttempts((n) => n + 1);
    // Set once the wallet has signed: from then on a failure may still be a
    // payment that reached the network, which the failure toast has to say.
    let signed = false;
    let pendingSettlementId: string | null = null;
    let localHash: string | null = null;
    try {
      const intent = target.expenseId
        ? await settleExpense.mutateAsync({
            expenseId: target.expenseId,
            data: {
              assetCode: target.assetCode,
              assetIssuer: target.assetIssuer,
            },
          })
        : await api.createSettlement(groupId, {
            toUserId: target.to.id,
            amount: target.amount,
            assetCode: target.assetCode,
            assetIssuer: target.assetIssuer,
          });          setStep("submitting");
      // Surface the MP: memo shown by the API on the intent, falling back to
      // the confirmed record — it is what ties this payment to its expense.
      setMemo(intent.settlement.memo ?? null);
      const signedXdr = await signXdr(intent.xdr, intent.networkPassphrase);
      signed = true;
      pendingSettlementId = intent.settlement.id;
      localHash = transactionHashFromXdr(signedXdr, intent.networkPassphrase);
      setSignedHash(localHash);
      const { settlement } = await confirm.mutateAsync({
        settlementId: intent.settlement.id,
        data: { signedXdr },
        optimisticTransfer: intent.settlement,
      });
      setSettlementId(intent.settlement.id);
      setTxHash(settlement.stellarTxHash ?? localHash);
      setMemo(settlement.memo ?? intent.settlement.memo ?? null);
      setStep("submitted");
      if (settlement.status === "confirmed") {
        setStep("confirmed");
        toast.success("Settled on Stellar");
      } else if (settlement.status === "failed") {
        setFailedAt(FAILED_AT_NETWORK);
        setStep("failed");
        setError(STELLAR_REJECTED_MESSAGE);
        notifySettlementFailure(stellarRejection());
      }
    } catch (e) {
      // The wallet signed but the hand-off to the API was lost (timeout, 5xx,
      // dropped connection): the payment may already be on Stellar, so asking
      // the user to retry could pay twice. Wait on the chain instead — the API
      // record and Horizon are both polled from "submitted", and "Check status"
      // stays available if neither has an answer (#814).
      if (signed && localHash && pendingSettlementId && isAmbiguousSubmissionError(e)) {
        setSettlementId(pendingSettlementId);
        setTxHash(localHash);
        setStep("submitted");
        toast.warning("Couldn't confirm the submission with Mergepay. Checking Stellar directly — don't retry yet.");
        return;
      }
      // Every failure lands in "failed" with the reason on screen and the
      // dialog still open, so the user retries instead of starting over.
      if (e instanceof WalletError) { setErrorCode(e.code); setError(e.code === "not_installed" ? <NotInstalledMessage /> : e.message); }
      else if (e instanceof ApiRequestError) { setErrorCode(null); setError(e.message); }
      else { setErrorCode(null); setError("Settlement failed. Please try again."); }
      setFailedAt(FAILED_AT_SIGNING);
      setStep("failed");
      // The same outcome as a toast, for a user who has looked away. A decline
      // in Freighter reads as a warning (nothing was sent), the rest as errors;
      // a failure after the wallet signed says the payment might still go through.
      const reason = e instanceof WalletError || e instanceof ApiRequestError
        ? classifySettlementError(e)
        : { kind: "unknown" as const, title: "Settlement failed", message: "Settlement failed. Please try again." };
      notifySettlementFailure(reason, { submitted: signed });
    }
  }

  /** Re-establish the wallet link, then go straight into another attempt. */
  async function reconnectAndRun() {
    setReconnecting(true);
    try {
      await connectWallet();
    } catch (e) {
      if (e instanceof WalletError) { setErrorCode(e.code); setError(e.code === "not_installed" ? <NotInstalledMessage /> : e.message); }
      else { setErrorCode("disconnected"); setError("Couldn't reconnect to Freighter. Check the extension and try again."); }
      setStep("failed");
      return;
    } finally {
      setReconnecting(false);
    }
    refreshWallet();
    await run({ skipWalletGate: true });
  }

  useEffect(() => {
    if (step !== "submitted" || !statusQuery.data) return;
    const live = statusQuery.data.stellarTxHash ?? null;
    if (statusQuery.data.status === "confirmed") { setTxHash(live); setStep("confirmed"); toast.success("Settled on Stellar"); }
    else if (statusQuery.data.status === "failed") {
      setFailedAt(FAILED_AT_NETWORK);
      setStep("failed");
      setError(STELLAR_REJECTED_MESSAGE);
      notifySettlementFailure(stellarRejection());
    }
  }, [step, statusQuery.data]);

  // Horizon answered before the API did: trust the ledger, then refresh the
  // group so balances and history catch up with it.
  useEffect(() => {
    if (step !== "submitted") return;
    if (horizon.state.status === "confirmed") {
      if (signedHash) setTxHash(signedHash);
      setStep("confirmed");
      toast.success("Settled on Stellar");
      void refreshSettlementCaches();
    } else if (horizon.state.status === "failed") {
      setFailedAt(FAILED_AT_NETWORK);
      setStep("failed");
      setError(STELLAR_REJECTED_MESSAGE);
      notifySettlementFailure(stellarRejection());
      void refreshSettlementCaches();
    }
    // Only a change of outcome matters; the setters and helpers are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, horizon.state.status]);

  // Say so once when status checks give up (lost connection, or still pending
  // after the polling window), so the dialog never looks like it is still working.
  const statusUnknownReason = statusQuery.pollingTimedOut ? "timed_out" : statusQuery.pollingStalled ? "stalled" : null;
  useEffect(() => {
    if (step !== "submitted" || !statusUnknownReason || horizonChecking) return;
    notifySettlementStatusUnknown(statusUnknownReason);
  }, [step, statusUnknownReason, horizonChecking]);

  // `active` resolves to bulkTarget in bulk mode and target in single mode;
  // both share the {to, amount, assetCode, label} shape we render here.
  if (!active) return null;
  return <>
    <Dialog
      open={open}
    onClose={close}
    title={active.label}
    description={`Send ${formatMoney(active.amount, active.assetCode)} to ${active.to.displayName}. You sign the payment in your wallet; Mergepay never holds your keys.`}
    dismissible={dismissible}
  >
    <div className="space-y-5">
      <div className="rounded-2xl border-3 border-ink bg-paper p-5"><div className="flex items-center justify-between"><span className="font-display text-xs uppercase tracking-widest text-ink/50">Paying</span><AssetBadge code={active.assetCode} /></div><div className="mt-3 flex items-center gap-3"><Avatar user={active.to} size="lg" /><div><p className="font-display text-lg uppercase tracking-tight">{active.to.displayName}</p><Money value={active.amount} assetCode={active.assetCode} className="text-2xl" /></div></div></div>
      {step !== "review" && (
        <TxProgress
          steps={PROGRESS}
          completed={step === "submitting" ? 1 : step === "submitted" ? 2 : step === "confirmed" ? 3 : failedAt}
          errored={step === "failed"}
          label="Settlement progress"
        />
      )}
      {step === "review" && (
        <div className="flex rounded-xl border-2 border-ink bg-paper p-1">
          <button
            type="button"
            onClick={() => setSettleMethod("wallet")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-display text-xs uppercase tracking-wider transition-all",
              settleMethod === "wallet"
                ? "border-2 border-ink bg-grape font-bold text-white shadow-brutal-sm"
                : "text-ink/70 hover:text-ink"
            )}
          >
            <Wallet className="h-4 w-4" /> Browser Wallet
          </button>
          <button
            type="button"
            onClick={() => setSettleMethod("qr")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-display text-xs uppercase tracking-wider transition-all",
              settleMethod === "qr"
                ? "border-2 border-ink bg-grape font-bold text-white shadow-brutal-sm"
                : "text-ink/70 hover:text-ink"
            )}
          >
            <QrCode className="h-4 w-4" /> Scan QR
          </button>
        </div>
      )}
      {step === "review" && settleMethod === "wallet" && (
        <>
          <MemoPreview
            memo={previewMemo}
            expectedCode={originalShortCode}
            editable
            editedMemo={editedMemo ?? previewMemo ?? ""}
            onEdit={(v) => setEditedMemo(v)}
          />
          <MemoWarningBanner
            memo={editedMemo ?? previewMemo}
            expectedShortCode={originalShortCode}
            onFixMemo={(v) => setEditedMemo(v)}
          />
          {trustlineAsset && wallet.address && (
            <TrustlineDetectionBanner
              publicKey={wallet.address}
              assetCode={trustlineAsset.code}
              assetIssuer={trustlineAsset.issuer}
              onSetupTrustline={() => setTrustlineModalOpen(true)}
            />
          )}<ol className="space-y-2 text-sm text-ink/70"><StepLine icon={<Wallet className="h-4 w-4" />}>Mergepay builds the payment — your keys never leave your wallet.</StepLine><StepLine icon={<PenLine className="h-4 w-4" />}>You sign it in Freighter.</StepLine><StepLine icon={<Send className="h-4 w-4" />}>It settles on Stellar and the ledger updates with the tx hash.</StepLine></ol><FeeEstimatorWidget operationCount={isBulk && bulkTarget ? bulkTarget.expenseIds.length + 1 : 1} amount={active.amount} assetCode={active.assetCode} /><WalletPrerequisiteNotice status={wallet} onRefresh={refreshWallet} /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={() => run()} disabled={!wallet.canSign || walletDisconnected} title={walletDisconnected ? "Reconnect your wallet to settle" : wallet.canSign ? undefined : wallet.message}><Wallet className="h-4 w-4" /> Settle now</Button></div></>
      )}
      {step === "review" && settleMethod === "qr" && (
        <div className="space-y-4">
          <PaymentQRCode
            address={active.to.stellarPublicKey}
            amount={active.amount}
            memo={editedMemo ?? previewMemo}
            assetCode={active.assetCode}
            assetIssuer={active.assetIssuer}
          />
          <div className="flex justify-end">
            <Button variant="ghost" onClick={close}>Close</Button>
          </div>
        </div>
      )}

      {step === "submitting" && (
        <TxStatusPanel
          tone="grape"
          icon={<Wallet className="h-7 w-7" />}
          title="Submitting to Stellar"
          body="Approve the transaction in your Freighter wallet, and we'll record it on the ledger."
          live
        />
      )}
      {step === "submitted" && !statusUnknown && (
        <TxStatusPanel
          tone="butter"
          icon={<Loader2 className="h-7 w-7 animate-spin" />}
          title="Waiting for confirmation"
          body={
            horizon.state.status === "polling"
              ? "Mergepay hasn't reported back yet, so we're checking Stellar directly. Nothing new is being submitted."
              : "Polling the network for the terminal transaction state. Keep this dialog open until the result is known."
          }
          live
        />
      )}
      {statusUnknown && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-3 border-ink bg-flamingo-pale px-4 py-5" role="alert" aria-live="polite">
          {statusQuery.pollingTimedOut ? <Clock className="h-7 w-7" aria-hidden="true" /> : <AlertTriangle className="h-7 w-7" aria-hidden="true" />}
          <p className="font-display text-sm uppercase tracking-tight">{statusQuery.pollingTimedOut ? "Still waiting for confirmation" : "Couldn't check status"}</p>
          <p className="text-center text-xs text-ink/60">
            {statusQuery.pollingTimedOut
              ? "Stellar is taking longer than usual. Your payment may still confirm; checking again doesn't submit anything new, and you can close this and come back."
              : "We lost the connection while waiting for confirmation. Your transaction may still be processing — this hasn't submitted anything new."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>Close</Button>
            <Button variant="outline" onClick={() => { statusQuery.restartPolling(); void statusQuery.refetch(); if (signedHash) horizon.restart(); }}><RefreshCcw className="h-4 w-4" /> Check status</Button>
          </div>
        </div>
      )}
      {step === "confirmed" && <div className="space-y-4 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-lime shadow-brutal"><CheckCircle2 className="h-8 w-8" /></div><div><p className="font-display text-lg uppercase tracking-tight">Settled!</p><p className="text-sm text-ink/60">Recorded on the Stellar ledger.</p></div>{txHash && <div className="flex flex-col items-center gap-1"><span className="font-display text-[10px] uppercase tracking-widest text-ink/50">Transaction</span><TxLink hash={txHash} /></div>}{memo && <div className="flex flex-col items-center gap-1"><span className="font-display text-[10px] uppercase tracking-widest text-ink/50">Memo</span><MemoBadge memo={memo} /></div>}<Button className="w-full" onClick={close}>Done</Button></div>}
      {step === "failed" && <div className="space-y-4">
        <WalletErrorBanner code={errorCode} message={error} />
        <p className="text-xs text-ink/60">
          {recovery === "install"
            ? "Nothing was submitted. Install Freighter, then reopen this dialog."
            : `Your payment details are still here${attempts > 1 ? ` (attempt ${attempts})` : ""}. ${
                recovery === "reconnect"
                  ? "Reconnect your wallet to try again."
                  : "Retrying builds a fresh transaction and asks Freighter to sign it again."
              }`}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Close</Button>
          {recovery === "reconnect" && (
            <Button onClick={reconnectAndRun} loading={reconnecting}>
              <Plug className="h-4 w-4" /> {retryLabelFor(errorCode)}
            </Button>
          )}
          {recovery === "retry" && (
            <Button
              onClick={() => run()}
              disabled={walletDisconnected || isOffline}
              title={
                isOffline
                  ? "You're offline — settlement requires an active connection"
                  : walletDisconnected
                    ? "Reconnect your wallet to settle"
                    : undefined
              }
            >
              <RefreshCcw className="h-4 w-4" /> {retryLabelFor(errorCode)}
            </Button>
          )}
        </div>
      </div>}
    </div>
  </Dialog>
  {trustlineAsset && wallet.address && (
    <TrustlinePromptModal
      open={trustlineModalOpen}
      onClose={() => setTrustlineModalOpen(false)}
      publicKey={wallet.address}
      assets={[trustlineAsset]}
      onReady={() => setTrustlinesReady(true)}
    />
  )}
</>;
}
