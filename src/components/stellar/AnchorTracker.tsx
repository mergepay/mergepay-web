"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ExternalLink, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Badge, statusTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAnchorTransaction, type AnchorTransactionLike } from "@/hooks/useAnchorTransaction";

export interface AnchorTrackerProps<T extends AnchorTransactionLike = AnchorTransactionLike> {
  transaction: T | null;
  title?: string;
  fetchStatus?: (id: string) => Promise<T | null>;
  pollIntervalMs?: number;
  className?: string;
}

const STEP_META = {
  incomplete: { label: "Initiated", detail: "Anchor session created" },
  pending_user_transfer_start: {
    label: "Awaiting Deposit",
    detail: "Complete the transfer required by the anchor",
  },
  pending_external: {
    label: "Awaiting Bank Portal",
    detail: "Finish the interactive flow in the external window",
  },
  pending_anchor: {
    label: "Stellar Processing",
    detail: "Transaction is being processed on-chain",
  },
  no_market_active: {
    label: "Market Pause",
    detail: "No active market is available right now",
  },
  completed: { label: "Finished", detail: "Transfer settled successfully" },
  error: { label: "Failed", detail: "The transfer could not be completed" },
  refunded: { label: "Refunded", detail: "The transfer was refunded" },
} as const;

const STEP_ORDER = [
  "incomplete",
  "pending_user_transfer_start",
  "pending_external",
  "pending_anchor",
  "completed",
] as const;

function getStepIndex(status: string): number {
  const resolved = STEP_ORDER.includes(status as (typeof STEP_ORDER)[number])
    ? (status as (typeof STEP_ORDER)[number])
    : "incomplete";

  return STEP_ORDER.indexOf(resolved);
}

export function AnchorTracker<T extends AnchorTransactionLike>({
  transaction,
  title = "Transaction status",
  fetchStatus,
  pollIntervalMs = 5_000,
  className,
}: AnchorTrackerProps<T>) {
  const txId = transaction?.id ?? null;
  const { status, isPolling, isConnected, requiresAction, error, refresh } = useAnchorTransaction(transaction, {
    enabled: Boolean(transaction && txId && fetchStatus),
    pollIntervalMs,
    fetchStatus,
  });

  const stepIndex = getStepIndex(String(status));
  const meta = STEP_META[String(status) as keyof typeof STEP_META] ?? STEP_META.incomplete;
  const isTerminal = ["completed", "error", "refunded"].includes(String(status));
  const canRetry = Boolean(error && !isTerminal);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "overflow-hidden rounded-3xl border-[3px] border-ink bg-paper shadow-brutal-sm",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 border-b-[3px] border-ink bg-butter px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4" />
          <span className="font-display text-xs uppercase tracking-[0.2em]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isPolling && <Loader2 className="h-4 w-4 animate-spin" />}
          <Badge tone={statusTone(String(status))}>{String(status).replace(/_/g, " ")}</Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3 rounded-2xl border-2 border-ink bg-cream p-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink/60">Current state</p>
            <p className="mt-1 text-lg font-black">{meta.label}</p>
            <p className="text-sm text-ink/70">{meta.detail}</p>
          </div>
          {isTerminal ? <CheckCircle2 className="h-6 w-6 text-lime" /> : <AlertTriangle className="h-6 w-6 text-tangerine" />}
        </div>

        <ol className="space-y-3">
          {STEP_ORDER.map((step, index) => {
            const isDone = index < stepIndex || (step === "completed" && isTerminal);
            const isCurrent = index === stepIndex && !isTerminal;
            const isPending = !isDone && !isCurrent;

            return (
              <li key={step} className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink text-xs font-black",
                    isDone && "bg-lime",
                    isCurrent && "bg-butter animate-pulse",
                    isPending && "bg-paper text-ink/40"
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-bold", isCurrent || isDone ? "text-ink" : "text-ink/40")}>
                    {STEP_META[step].label}
                  </p>
                  <p className="text-xs text-ink/60">{STEP_META[step].detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {!isConnected && (
          <div className="rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-sm font-bold text-ink">
            Offline — the app will retry the status check when connectivity returns.
          </div>
        )}

        {requiresAction && transaction?.interactiveUrl && (
          <div className="rounded-xl border-2 border-ink bg-grape-pale p-3 text-sm font-bold text-ink">
            <div className="flex items-center justify-between gap-3">
              <span>Action required</span>
              <ArrowRight className="h-4 w-4" />
            </div>
            <a
              href={transaction.interactiveUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex items-center gap-2 font-black underline"
            >
              Complete the secure anchor flow <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}

        {canRetry && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="w-full rounded-xl border-2 border-ink bg-cream px-3 py-2 text-sm font-black shadow-brutal-sm transition hover:bg-butter"
          >
            Retry status update
          </button>
        )}

        {error && !canRetry && (
          <p className="text-xs text-ink/70">{error}</p>
        )}
      </div>
    </motion.div>
  );
}
