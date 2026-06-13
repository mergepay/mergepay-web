"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, PenLine, Send, Wallet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { TxLink } from "@/components/tx-link";
import { api, ApiRequestError } from "@/lib/api";
import { signXdr, WalletError } from "@/lib/stellar";
import { useConfirmSettlement } from "@/lib/queries";
import type { SettlementSuggestion, User } from "@/lib/types";

type Step = "review" | "signing" | "confirming" | "done" | "error";

export interface SettleTarget {
  /** Either settle a specific expense share, or a freeform net suggestion. */
  expenseId?: string;
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

export function SettleDialog({
  open,
  onClose,
  groupId,
  target,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  target: SettleTarget | null;
}) {
  const confirm = useConfirmSettlement(groupId);
  const [step, setStep] = useState<Step>("review");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  function close() {
    onClose();
    // reset after the close animation
    setTimeout(() => {
      setStep("review");
      setTxHash(null);
      setError("");
    }, 200);
  }

  async function run() {
    if (!target) return;
    setError("");
    try {
      // 1. Ask the API to build an unsigned settlement intent.
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

      // 2. Sign the XDR in the wallet.
      setStep("signing");
      const signedXdr = await signXdr(intent.xdr, intent.networkPassphrase);

      // 3. Confirm — the API submits to Stellar and records the hash.
      setStep("confirming");
      const { settlement } = await confirm.mutateAsync({
        settlementId: intent.settlement.id,
        data: { signedXdr },
      });

      setTxHash(settlement.stellarTxHash);
      setStep("done");
      toast.success("Settled on Stellar");
    } catch (e) {
      if (e instanceof WalletError) setError(e.message);
      else if (e instanceof ApiRequestError) setError(e.message);
      else setError("Settlement failed. Please try again.");
      setStep("error");
    }
  }

  if (!target) return null;

  return (
    <Dialog open={open} onClose={close} title={target.label}>
      <div className="space-y-5">
        <div className="rounded-2xl border-3 border-ink bg-paper p-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs uppercase tracking-widest text-ink/50">
              Paying
            </span>
            <AssetBadge code={target.assetCode} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar user={target.to} size="lg" />
            <div>
              <p className="font-display text-lg uppercase tracking-tight">
                {target.to.displayName}
              </p>
              <Money
                value={target.amount}
                assetCode={target.assetCode}
                className="text-2xl"
              />
            </div>
          </div>
        </div>

        {step === "review" && (
          <>
            <ol className="space-y-2 text-sm text-ink/70">
              <StepLine icon={<Wallet className="h-4 w-4" />}>
                Mergepay builds the payment — your keys never leave your wallet.
              </StepLine>
              <StepLine icon={<PenLine className="h-4 w-4" />}>
                You sign it in Freighter.
              </StepLine>
              <StepLine icon={<Send className="h-4 w-4" />}>
                It settles on Stellar and the ledger updates with the tx hash.
              </StepLine>
            </ol>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button onClick={run}>
                <Wallet className="h-4 w-4" /> Settle now
              </Button>
            </div>
          </>
        )}

        {(step === "signing" || step === "confirming") && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Button loading variant="outline" className="pointer-events-none">
              {step === "signing" ? "Waiting for signature…" : "Submitting to Stellar…"}
            </Button>
            <p className="text-center text-sm text-ink/60">
              {step === "signing"
                ? "Approve the transaction in your Freighter wallet."
                : "Broadcasting your payment to the network."}
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-lime shadow-brutal">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="font-display text-lg uppercase tracking-tight">
                Settled!
              </p>
              <p className="text-sm text-ink/60">Recorded on the Stellar ledger.</p>
            </div>
            {txHash && (
              <div className="flex flex-col items-center gap-1">
                <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
                  Transaction
                </span>
                <TxLink hash={txHash} />
              </div>
            )}
            <Button className="w-full" onClick={close}>
              Done
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-ink bg-flamingo-pale px-4 py-3 text-sm">
              {error}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button onClick={run}>Try again</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

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
