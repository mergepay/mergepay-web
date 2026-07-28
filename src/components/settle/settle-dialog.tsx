"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Lock, PenLine, RefreshCcw, Send, ShieldX, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { TxLink } from "@/components/tx-link";
import { api, ApiRequestError } from "@/lib/api";
import { signXdr, WalletError, WalletErrorCode, NotInstalledMessage } from "@/lib/stellar";
import { useConfirmSettlement, useSettlementStatus } from "@/lib/queries";
import { validateSettlementInput } from "@/lib/paymentValidation";
import type { SettlementSuggestion, User } from "@/lib/types";

type Step = "review" | "submitting" | "submitted" | "confirmed" | "failed";

export interface SettleTarget {
  expenseId?: string;
  to: User;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  label: string;
}

export function suggestionToTarget(s: SettlementSuggestion): SettleTarget {
  return { to: s.to, amount: s.amount, assetCode: s.assetCode, assetIssuer: s.assetIssuer, label: `Settle up with ${s.to.displayName}` };
}

export function SettleDialog({ open, onClose, groupId, target }: { open: boolean; onClose: () => void; groupId: string; target: SettleTarget | null }) {
  const confirm = useConfirmSettlement(groupId);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("review");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<ReactNode>("");
  const [errorCode, setErrorCode] = useState<WalletErrorCode | null>(null);
  const statusQuery = useSettlementStatus(settlementId, step === "submitted");
  const transactionInFlight = step === "submitting" || step === "submitted";

  function close() {
    if (transactionInFlight) return;
    onClose();
    setTimeout(() => {
      setStep("review"); setTxHash(null); setError(""); setErrorCode(null); setSettlementId(null);
    }, 200);
  }

  async function run() {
    if (!target) return;
    const validation = validateSettlementInput({ amount: target.amount, assetCode: target.assetCode, assetIssuer: target.assetIssuer });
    if (!validation.valid) { setError(validation.error ?? "Invalid payment input"); setStep("failed"); return; }
    setError(""); setErrorCode(null);
    try {
      const intent = target.expenseId
        ? await api.settleExpense(target.expenseId, { assetCode: target.assetCode, assetIssuer: target.assetIssuer })
        : await api.createSettlement(groupId, { toUserId: target.to.id, amount: target.amount, assetCode: target.assetCode, assetIssuer: target.assetIssuer });
      setStep("submitting");
      const signedXdr = await signXdr(intent.xdr, intent.networkPassphrase);
      const { settlement } = await confirm.mutateAsync({ settlementId: intent.settlement.id, data: { signedXdr } });
      setSettlementId(intent.settlement.id); setTxHash(settlement.stellarTxHash ?? null); setStep("submitted");
      if (settlement.status === "confirmed") { setStep("confirmed"); toast.success("Settled on Stellar"); }
      else if (settlement.status === "failed") { setStep("failed"); setError("Stellar rejected this transaction. Please try again."); }
    } catch (e) {
      if (e instanceof WalletError) { setErrorCode(e.code); setError(e.code === "not_installed" ? <NotInstalledMessage /> : e.message); setStep("review"); }
      else if (e instanceof ApiRequestError) { setErrorCode(null); setError(e.message); setStep("failed"); }
      else { setErrorCode(null); setError("Settlement failed. Please try again."); setStep("failed"); }
    }
  }

  useEffect(() => {
    if (step !== "submitted" || !statusQuery.data) return;
    const live = statusQuery.data.stellarTxHash ?? null;
    if (statusQuery.data.status === "confirmed") { setTxHash(live); setStep("confirmed"); toast.success("Settled on Stellar"); }
    else if (statusQuery.data.status === "failed") { setStep("failed"); setError("Stellar rejected this transaction. Please try again."); }
  }, [step, statusQuery.data]);

  if (!target) return null;
  return <Dialog open={open} onClose={close} title={target.label} dismissible={!transactionInFlight}>
    <div className="space-y-5">
      <div className="rounded-2xl border-3 border-ink bg-paper p-5"><div className="flex items-center justify-between"><span className="font-display text-xs uppercase tracking-widest text-ink/50">Paying</span><AssetBadge code={target.assetCode} /></div><div className="mt-3 flex items-center gap-3"><Avatar user={target.to} size="lg" /><div><p className="font-display text-lg uppercase tracking-tight">{target.to.displayName}</p><Money value={target.amount} assetCode={target.assetCode} className="text-2xl" /></div></div></div>
      {step === "review" && <><ol className="space-y-2 text-sm text-ink/70"><StepLine icon={<Wallet className="h-4 w-4" />}>Mergepay builds the payment — your keys never leave your wallet.</StepLine><StepLine icon={<PenLine className="h-4 w-4" />}>You sign it in Freighter.</StepLine><StepLine icon={<Send className="h-4 w-4" />}>It settles on Stellar and the ledger updates with the tx hash.</StepLine></ol>{error && <WalletErrorBanner code={errorCode} message={error} />}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={run}><Wallet className="h-4 w-4" /> Settle now</Button></div></>}
      {step === "submitting" && <div className="flex flex-col items-center gap-3 py-4" aria-busy aria-live="polite"><Button loading variant="outline" className="pointer-events-none">Submitting to Stellar…</Button><p className="text-center text-sm text-ink/60">Approve the transaction in your Freighter wallet, and we'll record it on the ledger.</p></div>}
      {step === "submitted" && <div className="flex flex-col items-center gap-3 rounded-2xl border-3 border-ink bg-butter-pale px-4 py-5" role="status" aria-live="polite"><Loader2 className="h-7 w-7 animate-spin text-grape" /><p className="font-display text-sm uppercase tracking-tight">Waiting for confirmation</p><p className="text-center text-xs text-ink/60">Polling the network for the terminal transaction state. Keep this dialog open until the result is known.</p></div>}
      {step === "confirmed" && <div className="space-y-4 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-lime shadow-brutal"><CheckCircle2 className="h-8 w-8" /></div><div><p className="font-display text-lg uppercase tracking-tight">Settled!</p><p className="text-sm text-ink/60">Recorded on the Stellar ledger.</p></div>{txHash && <div className="flex flex-col items-center gap-1"><span className="font-display text-[10px] uppercase tracking-widest text-ink/50">Transaction</span><TxLink hash={txHash} /></div>}<Button className="w-full" onClick={close}>Done</Button></div>}
      {step === "failed" && <div className="space-y-4"><div className="rounded-xl border-2 border-ink bg-flamingo-pale px-4 py-3 text-sm">{error}</div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Close</Button><Button onClick={run}><RefreshCcw className="h-4 w-4" /> Try again</Button></div></div>}
    </div>
  </Dialog>;
}

function StepLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) { return <li className="flex items-start gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">{icon}</span><span>{children}</span></li>; }
function WalletErrorBanner({ code, message }: { code: WalletErrorCode | null; message: ReactNode }) { const icon = code === "locked" ? <Lock className="h-4 w-4" /> : code === "not_installed" ? <ShieldX className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />; return <div className="flex items-start gap-3 rounded-xl border-2 border-ink bg-butter-pale px-4 py-3 text-sm" role="alert"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">{icon}</span><span>{message}</span></div>; }
