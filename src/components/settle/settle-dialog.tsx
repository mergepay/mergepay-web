"use client";

import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  Lock,
  PenLine,
  RefreshCcw,
  Send,
  ShieldX,
  Wallet,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { TxLink } from "@/components/tx-link";
import { WalletErrorCode } from "@/lib/stellar";
import {
  useSettlementFlow,
  type SettlementStep,
  type SettleTarget,
} from "@/lib/useSettlementFlow";
import type { ReactNode } from "react";

// Re-export for consumers
export { suggestionToTarget } from "@/lib/useSettlementFlow";
export type { SettleTarget } from "@/lib/useSettlementFlow";

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

function StatusCard({ icon, title, description }: StepMeta) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border-3 border-ink bg-butter-pale px-4 py-5"
      role="status"
      aria-live="polite"
    >
      {icon}
      <p className="font-display text-sm uppercase tracking-tight">{title}</p>
      {description && (
        <p className="text-center text-xs text-ink/60">{description}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

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
  const flow = useSettlementFlow(groupId);
  const prevOpen = useRef(false);

  // Open / close lifecycle
  useEffect(() => {
    if (open && !prevOpen.current) {
      flow.open();
    }
    if (!open && prevOpen.current) {
      setTimeout(() => flow.resetAll(), 200);
    }
    prevOpen.current = open;
  }, [open, flow]);

  if (!target) return null;

  const meta = STEP_META[flow.step];

  return (
    <Dialog open={open} onClose={onClose} title={target.label} dismissible={false}>
      <div className="space-y-5">
        {/* Recipient card — always visible */}
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

        {/* ---- REVIEW ---- */}
        {flow.step === "review" && (
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

            {flow.error && (
              <WalletErrorBanner
                code={flow.walletErrorCode}
                message={flow.error}
              />
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => flow.submit(target)}
                disabled={flow.isSubmitting}
              >
                <Wallet className="h-4 w-4" /> Settle now
              </Button>
            </div>
          </>
        )}

        {/* ---- PREPARING / AWAITING_WALLET / SUBMITTED ---- */}
        {(flow.step === "preparing" ||
          flow.step === "awaiting_wallet" ||
          flow.step === "submitted") &&
          meta && <StatusCard {...meta} />}

        {/* ---- CONFIRMED ---- */}
        {flow.step === "confirmed" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-lime shadow-brutal">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="font-display text-lg uppercase tracking-tight">
                Settled!
              </p>
              <p className="text-sm text-ink/60">
                Recorded on the Stellar ledger.
              </p>
            </div>
            {flow.txHash && (
              <div className="flex flex-col items-center gap-1">
                <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
                  Transaction
                </span>
                <TxLink hash={flow.txHash} />
              </div>
            )}
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        )}

        {/* ---- CANCELLED ---- */}
        {flow.step === "cancelled" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-ink bg-butter-pale shadow-brutal">
              <Ban className="h-8 w-8" />
            </div>
            <div>
              <p className="font-display text-lg uppercase tracking-tight">
                Cancelled
              </p>
              <p className="text-sm text-ink/60">
                No transaction was submitted.
              </p>
            </div>
            {/* Show the specific error for non-rejection cancellations
                (locked, disconnected, network, not_installed).  For
                user_rejected the message is redundant with the heading. */}
            {flow.error && flow.walletErrorCode !== "user_rejected" && (
              <WalletErrorBanner
                code={flow.walletErrorCode}
                message={flow.error}
              />
            )}
            <div className="flex justify-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => flow.submit(target)}>
                <RefreshCcw className="h-4 w-4" /> Try again
              </Button>
            </div>
          </div>
        )}

        {/* ---- FAILED ---- */}
        {flow.step === "failed" && (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-ink bg-flamingo-pale px-4 py-3 text-sm">
              {flow.error || "Settlement failed. Please try again."}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => flow.retry(target)}>
                <RefreshCcw className="h-4 w-4" /> Try again
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
