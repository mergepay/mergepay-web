"use client";

import { Check, AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { useAnchorStatusPolling } from "@/hooks/useAnchorStatusPolling";
import type { AnchorSession, AnchorSessionStatus } from "@/lib/types";

export interface AnchorStatusModalProps {
  session: AnchorSession | null;
  onClose: () => void;
  open?: boolean;
}

interface Step {
  id: string;
  label: string;
  description: string;
}

const DEPOSIT_STEPS: Step[] = [
  { id: "incomplete", label: "Flow Initialized", description: "SEP-24 session created" },
  { id: "pending_user_transfer_start", label: "User Deposit Pending", description: "Send fiat funds to anchor" },
  { id: "pending_anchor", label: "Anchor Processing", description: "Anchor verifying & minting tokens" },
  { id: "completed", label: "Settlement Complete", description: "Tokens credited to your wallet" },
];

const WITHDRAWAL_STEPS: Step[] = [
  { id: "incomplete", label: "Flow Initialized", description: "SEP-24 session created" },
  { id: "pending_user_transfer_start", label: "Stellar Transfer Pending", description: "Send tokens to anchor address" },
  { id: "pending_anchor", label: "Payout Processing", description: "Anchor sending fiat to bank" },
  { id: "completed", label: "Settlement Complete", description: "Fiat delivered to your bank account" },
];

function getStepIndex(status: AnchorSessionStatus): number {
  switch (status) {
    case "incomplete":
      return 0;
    case "pending_user_transfer_start":
      return 1;
    case "pending_anchor":
      return 2;
    case "completed":
    case "refunded":
    case "error":
      return 3;
    default:
      return 0;
  }
}

export function AnchorStatusModal({ session: initialSession, onClose, open = true }: AnchorStatusModalProps) {
  const { session, isPolling, isError, refetchNow } = useAnchorStatusPolling(initialSession);

  if (!session) return null;

  const currentStatus = session.status;
  const isTerminal = ["completed", "error", "refunded"].includes(currentStatus);
  const steps = session.kind === "deposit" ? DEPOSIT_STEPS : WITHDRAWAL_STEPS;
  const activeStepIndex = getStepIndex(currentStatus);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${session.kind === "deposit" ? "Fiat Deposit" : "Fiat Withdrawal"} — ${session.assetCode}`}
      description={`Real-time SEP-24 status with ${session.anchorName}`}
    >
      <div className="space-y-5">
        {/* Status header card */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-3 border-ink bg-paper p-4 shadow-brutal-sm">
          <div className="flex items-center gap-3">
            <AssetBadge code={session.assetCode} />
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink/60">
                {session.anchorName}
              </p>
              <p className="font-bold capitalize">{session.kind} Transfer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPolling && <Loader2 className="h-4 w-4 animate-spin text-ink/60" />}
            <Badge tone={statusTone(currentStatus)}>
              {currentStatus.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        {/* Polling Error Alert */}
        {isError && (
          <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-xs font-bold">
            <span className="flex items-center gap-2 text-ink">
              <AlertCircle className="h-4 w-4 shrink-0 text-flamingo" />
              Network issue updating status.
            </span>
            <Button size="sm" variant="outline" onClick={() => void refetchNow()}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        )}

        {/* Step Progress Visualizer */}
        <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-brutal-sm">
          <h4 className="mb-4 font-display text-xs uppercase tracking-widest text-ink/60">
            Progress Steps
          </h4>
          <ol className="space-y-3">
            {steps.map((step, idx) => {
              const isDone = idx < activeStepIndex || (idx === 3 && currentStatus === "completed");
              const isCurrent = idx === activeStepIndex && !isTerminal;
              const isFailed = idx === activeStepIndex && (currentStatus === "error" || currentStatus === "refunded");

              return (
                <li key={step.id} className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink font-mono text-xs font-bold ${
                      isDone
                        ? "bg-lime text-ink"
                        : isFailed
                        ? "bg-flamingo text-ink"
                        : isCurrent
                        ? "bg-butter text-ink animate-pulse"
                        : "bg-paper text-ink/40"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4 stroke-[3]" /> : idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-bold ${
                        isCurrent || isDone ? "text-ink" : "text-ink/40"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-ink/60">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>

          {session.interactiveUrl && !isTerminal && (
            <a href={session.interactiveUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="primary">
                Resume In Interactive Window <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          )}
        </div>
      </div>
    </Dialog>
  );
}
