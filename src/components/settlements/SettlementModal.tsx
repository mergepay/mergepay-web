"use client";

/**
 * On-chain settlement confirmation modal (#354).
 *
 * Walks the payer through settling a debt on Stellar in four steps:
 *
 *   review → sign (Freighter) → submitting (network) → success | error
 *
 * Safety properties:
 *  - The unsigned envelope from the API is decoded and checked before the
 *    wallet is opened: it must pay the right member, in the right asset and
 *    amount, with the settlement's `MP:` memo. The signed envelope is checked
 *    again, and the confirmed record's memo is verified before "Settled" is
 *    shown.
 *  - A signature the user declines, a wallet that never answers, and a
 *    network that never confirms each land on a distinct error with the right
 *    recovery. Once a signed payment has been handed to the API, "retry"
 *    only re-checks its status — it never builds and signs a second payment.
 *  - Closing the modal (or unmounting it) aborts timers and polling, and
 *    results from a cancelled attempt are ignored.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PenLine,
  RefreshCcw,
  Send,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { TxProgress, TxStatusPanel } from "@/components/ui/tx-progress";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { TxLink } from "@/components/tx-link";
import { MemoBadge } from "@/components/stellar/MemoBadge";
import { WalletPrerequisiteNotice } from "@/components/wallet/wallet-status";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { api } from "@/lib/api";
import { useConfirmSettlement } from "@/lib/queries";
import { signXdr } from "@/lib/stellar";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isNetworkMismatch, type SettleTarget } from "@/lib/useSettlementFlow";
import {
  SettlementVerificationError,
  classifySettlementError,
  inspectSettlementXdr,
  verifySettledMemo,
  verifySettlementEnvelope,
  waitForSettlementConfirmation,
  withDeadline,
  type ClassifiedSettlementError,
} from "@/lib/stellar/transactions";
import type { Settlement } from "@/lib/types";

export type SettlementModalStep = "review" | "sign" | "submitting" | "success" | "error";

/** Deadlines for each network/wallet leg, in ms. Overridable for tests. */
export interface SettlementTimeouts {
  prepare: number;
  sign: number;
  submit: number;
  confirm: number;
  pollInterval: number;
}

export const DEFAULT_SETTLEMENT_TIMEOUTS: SettlementTimeouts = {
  prepare: 30_000,
  sign: 120_000,
  submit: 45_000,
  confirm: 90_000,
  pollInterval: 2_500,
};

export interface SettlementModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  target: SettleTarget | null;
  onSettled?: (settlement: Settlement) => void;
  timeouts?: Partial<SettlementTimeouts>;
}

const PROGRESS: { id: Exclude<SettlementModalStep, "error">; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "sign", label: "Sign" },
  { id: "submitting", label: "Submit" },
  { id: "success", label: "Done" },
];

type SignPhase = "preparing" | "verifying" | "wallet";
type SubmitPhase = "sending" | "confirming";

export function SettlementModal({ open, onClose, groupId, target, onSettled, timeouts }: SettlementModalProps) {
  const limits = { ...DEFAULT_SETTLEMENT_TIMEOUTS, ...timeouts };
  const confirm = useConfirmSettlement(groupId);
  const { refresh: refreshWallet, ...wallet } = useWalletStatus();
  const reduceMotion = useReducedMotion();

  const [step, setStep] = useState<SettlementModalStep>("review");
  const [signPhase, setSignPhase] = useState<SignPhase>("preparing");
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("sending");
  const [failedAt, setFailedAt] = useState<Exclude<SettlementModalStep, "error">>("review");
  const [error, setError] = useState<ClassifiedSettlementError | null>(null);
  const [expectedMemo, setExpectedMemo] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [settled, setSettled] = useState<Settlement | null>(null);

  // Each attempt gets an AbortController and a run id; anything that
  // resolves after the modal closed or a newer attempt started is dropped.
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runRef.current += 1;
  }, []);

  useEffect(() => cancelInFlight, [cancelInFlight]);

  // Reset once the modal is closed so the next open starts at "review".
  useEffect(() => {
    if (open) return;
    cancelInFlight();
    const timer = setTimeout(() => {
      setStep("review");
      setError(null);
      setExpectedMemo(null);
      setSettlementId(null);
      setSubmitted(false);
      setSettled(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [open, cancelInFlight]);

  // A signed payment is on its way to the ledger; closing now would hide the outcome.
  const locked = step === "submitting";

  function close() {
    if (locked) return;
    cancelInFlight();
    onClose();
  }

  function begin() {
    cancelInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    const run = runRef.current;
    return { signal: controller.signal, isCurrent: () => runRef.current === run && !controller.signal.aborted };
  }

  function fail(e: unknown, at: Exclude<SettlementModalStep, "error">) {
    const classified = classifySettlementError(e);
    if (classified.kind === "aborted") return;
    // Rejected on-chain means no funds moved, so a fresh attempt is safe.
    if (classified.kind === "failed") setSubmitted(false);
    setError(classified);
    setFailedAt(at);
    setStep("error");
  }

  async function finish(settlement: Settlement, memo: string, isCurrent: () => boolean) {
    if (settlement.status === "failed") {
      throw Object.assign(new Error("Stellar rejected this payment. No funds moved."), { code: "tx_failed" });
    }
    verifySettledMemo(settlement, memo);
    if (!isCurrent()) return;
    setSettled(settlement);
    setStep("success");
    toast.success("Settled on Stellar");
    onSettled?.(settlement);
  }

  async function awaitConfirmation(id: string, memo: string, signal: AbortSignal, isCurrent: () => boolean) {
    setSubmitPhase("confirming");
    const settlement = await waitForSettlementConfirmation({
      settlementId: id,
      fetchSettlement: (sid) => api.getSettlement(sid).then((r) => r.settlement),
      signal,
      intervalMs: limits.pollInterval,
      timeoutMs: limits.confirm,
    });
    if (!isCurrent()) return;
    await finish(settlement, memo, isCurrent);
  }

  async function run() {
    if (!target || !wallet.canSign) return;
    const { signal, isCurrent } = begin();
    setError(null);
    setSubmitted(false);
    setSettlementId(null);
    setStep("sign");
    setSignPhase("preparing");
    let stage: Exclude<SettlementModalStep, "error"> = "sign";

    try {
      const intent = await withDeadline(
        target.expenseId
          ? api.settleExpense(target.expenseId, { assetCode: target.assetCode, assetIssuer: target.assetIssuer })
          : api.createSettlement(groupId, {
              toUserId: target.to.id,
              amount: target.amount,
              assetCode: target.assetCode,
              assetIssuer: target.assetIssuer,
            }),
        limits.prepare,
        signal,
        "Mergepay took too long to prepare the payment. Nothing was sent."
      );
      if (!isCurrent()) return;

      if (isNetworkMismatch(intent.networkPassphrase)) {
        throw new SettlementVerificationError(
          "no_payment",
          "This payment was built for a different Stellar network than the app is using."
        );
      }

      // Verify what the user is about to sign, before the wallet opens.
      setSignPhase("verifying");
      const memo = intent.settlement.memo ?? null;
      setExpectedMemo(memo);
      const expected = {
        memo,
        destination: target.to.stellarPublicKey || null,
        assetCode: target.assetCode,
        assetIssuer: target.assetIssuer,
        // An expense settle is priced by the API (it may path-pay), so only
        // a direct settle-up is held to the exact amount on screen.
        amount: target.expenseId ? null : target.amount,
      };
      verifySettlementEnvelope(inspectSettlementXdr(intent.xdr, intent.networkPassphrase), expected);

      setSignPhase("wallet");
      const signedXdr = await withDeadline(
        signXdr(intent.xdr, intent.networkPassphrase),
        limits.sign,
        signal,
        "Freighter didn't respond. Nothing was sent — reopen the wallet and try again."
      );
      if (!isCurrent()) return;
      verifySettlementEnvelope(inspectSettlementXdr(signedXdr, intent.networkPassphrase), expected);

      stage = "submitting";
      setStep("submitting");
      setSubmitPhase("sending");
      setSettlementId(intent.settlement.id);
      setSubmitted(true);
      const { settlement } = await withDeadline(
        confirm.mutateAsync({ settlementId: intent.settlement.id, data: { signedXdr } }),
        limits.submit,
        signal,
        "The network is taking longer than usual. Your payment may still go through — check its status before trying again."
      );
      if (!isCurrent()) return;

      if (settlement.status === "confirmed" || settlement.status === "failed") {
        await finish(settlement, memo as string, isCurrent);
      } else {
        await awaitConfirmation(intent.settlement.id, memo as string, signal, isCurrent);
      }
    } catch (e) {
      if (isCurrent()) fail(e, stage);
    }
  }

  /** After a submission timed out: poll again, never re-send. */
  async function recheck() {
    if (!settlementId || !expectedMemo) return;
    const { signal, isCurrent } = begin();
    setError(null);
    setStep("submitting");
    try {
      await awaitConfirmation(settlementId, expectedMemo, signal, isCurrent);
    } catch (e) {
      if (isCurrent()) fail(e, "submitting");
    }
  }

  if (!target) return null;

  const progressIndex = PROGRESS.findIndex((p) => p.id === (step === "error" ? failedAt : step));
  const motionProps = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={target.label}
      description={`Send ${formatMoney(target.amount, target.assetCode)} to ${target.to.displayName}. You sign in your wallet; Mergepay never holds your keys.`}
      dismissible={!locked}
    >
      <div className="space-y-5">
        <TxProgress
          steps={PROGRESS}
          completed={progressIndex}
          errored={step === "error"}
          label="Settlement progress"
        />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...motionProps} transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}>
            {step === "review" && (
              <div className="space-y-4">
                <RecipientCard target={target} />
                <ul className="space-y-2 text-sm text-ink/70">
                  <Bullet icon={<ShieldCheck className="h-4 w-4" />}>
                    Mergepay builds the payment with an <span className="font-mono">MP:</span> memo, and we check the
                    recipient, amount and memo before your wallet opens.
                  </Bullet>
                  <Bullet icon={<PenLine className="h-4 w-4" />}>You approve it in Freighter — your keys never leave the wallet.</Bullet>
                  <Bullet icon={<Send className="h-4 w-4" />}>It settles on Stellar and the debt is marked paid once the memo is confirmed.</Bullet>
                </ul>
                <WalletPrerequisiteNotice status={wallet} onRefresh={refreshWallet} />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button onClick={run} disabled={!wallet.canSign} title={wallet.canSign ? undefined : wallet.message}>
                    <Wallet className="h-4 w-4" /> Confirm & sign
                  </Button>
                </div>
              </div>
            )}

            {step === "sign" && (
              <TxStatusPanel
                tone="grape"
                icon={signPhase === "wallet" ? <Wallet className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
                title={signPhase === "preparing" ? "Preparing payment" : signPhase === "verifying" ? "Verifying payment" : "Check your wallet"}
                body={
                  signPhase === "preparing"
                    ? "Mergepay is building the Stellar transaction…"
                    : signPhase === "verifying"
                      ? "Checking the recipient, amount and MP: memo before you sign…"
                      : "Approve the payment in Freighter. Declining is safe — nothing is sent."
                }
                footer={
                  <>
                    {expectedMemo && <MemoLine memo={expectedMemo} verified={signPhase === "wallet"} />}
                    <Button variant="ghost" size="sm" onClick={close}>
                      Cancel
                    </Button>
                  </>
                }
              />
            )}

            {step === "submitting" && (
              <TxStatusPanel
                tone="butter"
                icon={<Loader2 className="h-7 w-7 animate-spin" />}
                title={submitPhase === "sending" ? "Submitting to Stellar" : "Waiting for confirmation"}
                body={
                  submitPhase === "sending"
                    ? "Sending your signed payment to the network…"
                    : "The network has your payment. Waiting for the ledger to confirm it — this usually takes a few seconds."
                }
                footer={expectedMemo && <MemoLine memo={expectedMemo} verified />}
                live
              />
            )}

            {step === "success" && settled && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-lime shadow-brutal">
                  <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                </div>
                <div role="status">
                  <p className="font-display text-lg uppercase tracking-tight">Settled!</p>
                  <p className="text-sm text-ink/60">Recorded on the Stellar ledger with a verified memo.</p>
                </div>
                {settled.stellarTxHash && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">Transaction</span>
                    <TxLink hash={settled.stellarTxHash} />
                  </div>
                )}
                {settled.memo && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">Memo</span>
                    <MemoBadge memo={settled.memo} />
                  </div>
                )}
                <Button className="w-full" onClick={close}>
                  Done
                </Button>
              </div>
            )}

            {step === "error" && error && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border-3 border-ink bg-flamingo-pale p-4 shadow-brutal-sm" role="alert">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
                    {error.kind === "timeout" ? (
                      <Clock className="h-4 w-4" aria-hidden="true" />
                    ) : error.kind === "rejected" ? (
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <p className="font-display text-sm uppercase tracking-tight">{error.title}</p>
                    <p className="mt-1 text-sm">{error.message}</p>
                  </div>
                </div>
                <p className="text-xs text-ink/60">
                  {!submitted
                    ? "Nothing was submitted. Your payment details are unchanged."
                    : error.kind === "verification"
                      ? "The payment was sent but its memo could not be verified, so it has not been shown as settled. Ask a group admin to reconcile it — do not pay again."
                      : "Your signed payment reached Mergepay. Check its status instead of paying again."}
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="ghost" onClick={close}>
                    Close
                  </Button>
                  {submitted ? (
                    error.kind !== "verification" &&
                    settlementId &&
                    expectedMemo && (
                      <Button onClick={recheck}>
                        <RefreshCcw className="h-4 w-4" /> Check status
                      </Button>
                    )
                  ) : (
                    <Button onClick={run} disabled={!wallet.canSign}>
                      <RefreshCcw className="h-4 w-4" /> Try again
                    </Button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function RecipientCard({ target }: { target: SettleTarget }) {
  return (
    <div className="rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal-sm">
      <div className="flex items-center justify-between">
        <span className="font-display text-xs uppercase tracking-widest text-ink/50">Paying</span>
        <AssetBadge code={target.assetCode} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Avatar user={target.to} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg uppercase tracking-tight">{target.to.displayName}</p>
          <Money value={target.amount} assetCode={target.assetCode} className="text-2xl" />
        </div>
      </div>
    </div>
  );
}

function Bullet({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function MemoLine({ memo, verified }: { memo: string; verified: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {verified ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      <span className="font-mono">{memo}</span>
      <span className="text-ink/60">{verified ? "memo verified" : "checking memo"}</span>
    </span>
  );
}
