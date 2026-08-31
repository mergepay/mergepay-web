"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Lock, PenLine, Plug, RefreshCcw, Send, ShieldX, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { TxLink } from "@/components/tx-link";
import { SettlementConfirmation } from "@/components/settle/settlement-confirmation";
import { api, ApiRequestError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { connectWallet, signXdr, WalletError, WalletErrorCode, NotInstalledMessage } from "@/lib/stellar";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { WalletPrerequisiteNotice } from "@/components/wallet/wallet-status";
import { useConfirmSettlement, useSettlementStatus } from "@/lib/queries";
import { validateSettlementInput } from "@/lib/paymentValidation";
import { recoveryActionFor, retryLabelFor } from "@/lib/settlementRetry";
import { useWalletDisconnected } from "@/lib/wallet-store";
import type { SettlementStep, SettleTarget } from "@/lib/useSettlementFlow";
import type { SettlementSuggestion, User } from "@/lib/types";
import { FeeEstimatorWidget } from "@/components/FeeEstimatorWidget";
import { MemoPreview } from "@/components/settle/MemoPreview";
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
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("review");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<ReactNode>("");
  const [errorCode, setErrorCode] = useState<WalletErrorCode | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const statusQuery = useSettlementStatus(settlementId, step === "submitted");
  const transactionInFlight = step === "submitting" || step === "submitted";
  // The settle target lives in props and is never mutated here, so a failed
  // attempt leaves the amount, asset, and recipient intact for the retry.
  const recovery = recoveryActionFor(errorCode);
  const { refresh: refreshWallet, ...wallet } = useWalletStatus();
  // Signing requires the wallet — block new attempts while disconnected.
  const walletDisconnected = useWalletDisconnected();
  // Prevent on-chain submissions when the browser is offline.
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  const isBulk = !!bulkTarget;
  const active = isBulk ? bulkTarget : target;
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
  const dismissible = step !== "submitting" && step !== "submitted";

  function close() {
    if (transactionInFlight) return;
    onClose();
    // reset after the close animation
    setTimeout(() => {
      setStep("review"); setTxHash(null); setError(""); setErrorCode(null); setSettlementId(null); setAttempts(0); setReconnecting(false);
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
    const validation = validateSettlementInput({ amount: target.amount, assetCode: target.assetCode, assetIssuer: target.assetIssuer });
    if (!validation.valid) { setError(validation.error ?? "Invalid payment input"); setErrorCode(null); setStep("failed"); return; }
    // Clear the previous attempt's residue so a retry never shows a stale tx
    // hash or keeps polling the settlement that already failed.
    setError(""); setErrorCode(null); setTxHash(null); setSettlementId(null); setAttempts((n) => n + 1);
    try {
      const intent = target.expenseId
        ? await api.settleExpense(target.expenseId, {
            assetCode: target.assetCode,
            assetIssuer: target.assetIssuer,
          })
        : await api.createSettlement(groupId, {
            toUserId: target.to.id,
            amount: target.amount,
            assetCode: target.assetCode,
            assetIssuer: target.assetIssuer,
          });
      setStep("submitting");
      const signedXdr = await signXdr(intent.xdr, intent.networkPassphrase);
      const { settlement } = await confirm.mutateAsync({
        settlementId: intent.settlement.id,
        data: { signedXdr },
      });
      setSettlementId(intent.settlement.id);
      setTxHash(settlement.stellarTxHash ?? null);
      setStep("submitted");
      if (settlement.status === "confirmed") {
        setStep("confirmed");
        toast.success("Settled on Stellar");
      } else if (settlement.status === "failed") {
        setStep("failed");
        setError("Stellar rejected this transaction. Please try again.");
      }
    } catch (e) {
      // Every failure lands in "failed" with the reason on screen and the
      // dialog still open, so the user retries instead of starting over.
      if (e instanceof WalletError) { setErrorCode(e.code); setError(e.code === "not_installed" ? <NotInstalledMessage /> : e.message); }
      else if (e instanceof ApiRequestError) { setErrorCode(null); setError(e.message); }
      else { setErrorCode(null); setError("Settlement failed. Please try again."); }
      setStep("failed");
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
    else if (statusQuery.data.status === "failed") { setStep("failed"); setError("Stellar rejected this transaction. Please try again."); }
  }, [step, statusQuery.data]);

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
      {step === "review" && <><MemoPreview memo={previewMemo} expectedCode={originalShortCode} editable editedMemo={editedMemo ?? previewMemo ?? ""} onEdit={(v) => setEditedMemo(v)} />{trustlineAsset && wallet.address && (<TrustlineDetectionBanner publicKey={wallet.address} assetCode={trustlineAsset.code} assetIssuer={trustlineAsset.issuer} onSetupTrustline={() => setTrustlineModalOpen(true)} />)}<ol className="space-y-2 text-sm text-ink/70"><StepLine icon={<Wallet className="h-4 w-4" />}>Mergepay builds the payment — your keys never leave your wallet.</StepLine><StepLine icon={<PenLine className="h-4 w-4" />}>You sign it in Freighter.</StepLine><StepLine icon={<Send className="h-4 w-4" />}>It settles on Stellar and the ledger updates with the tx hash.</StepLine></ol><FeeEstimatorWidget operationCount={isBulk && bulkTarget ? bulkTarget.expenseIds.length + 1 : 1} amount={active.amount} assetCode={active.assetCode} /><WalletPrerequisiteNotice status={wallet} onRefresh={refreshWallet} /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={() => run()} disabled={!wallet.canSign || walletDisconnected} title={walletDisconnected ? "Reconnect your wallet to settle" : wallet.canSign ? undefined : wallet.message}><Wallet className="h-4 w-4" /> Settle now</Button></div></>}

      {step === "submitting" && <div className="flex flex-col items-center gap-3 py-4" aria-busy aria-live="polite"><Button loading variant="outline" className="pointer-events-none">Submitting to Stellar…</Button><p className="text-center text-sm text-ink/60">Approve the transaction in your Freighter wallet, and we'll record it on the ledger.</p></div>}
      {step === "submitted" && !statusQuery.pollingStalled && <div className="flex flex-col items-center gap-3 rounded-2xl border-3 border-ink bg-butter-pale px-4 py-5" role="status" aria-live="polite"><Loader2 className="h-7 w-7 animate-spin text-grape" /><p className="font-display text-sm uppercase tracking-tight">Waiting for confirmation</p><p className="text-center text-xs text-ink/60">Polling the network for the terminal transaction state. Keep this dialog open until the result is known.</p></div>}
      {step === "submitted" && statusQuery.pollingStalled && <div className="flex flex-col items-center gap-3 rounded-2xl border-3 border-ink bg-flamingo-pale px-4 py-5" role="alert" aria-live="polite"><AlertTriangle className="h-7 w-7" /><p className="font-display text-sm uppercase tracking-tight">Couldn't check status</p><p className="text-center text-xs text-ink/60">We lost the connection while waiting for confirmation. Your transaction may still be processing — this hasn't submitted anything new.</p><Button variant="outline" onClick={() => statusQuery.refetch()}><RefreshCcw className="h-4 w-4" /> Check status</Button></div>}
      {step === "confirmed" && <div className="space-y-4 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-lime shadow-brutal"><CheckCircle2 className="h-8 w-8" /></div><div><p className="font-display text-lg uppercase tracking-tight">Settled!</p><p className="text-sm text-ink/60">Recorded on the Stellar ledger.</p></div>{txHash && <div className="flex flex-col items-center gap-1"><span className="font-display text-[10px] uppercase tracking-widest text-ink/50">Transaction</span><TxLink hash={txHash} /></div>}<Button className="w-full" onClick={close}>Done</Button></div>}
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
