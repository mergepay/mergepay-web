"use client";

/**
 * ExpenseSplitPreview (#383)
 *
 * Renders an itemized, per-participant breakdown of how an expense is split,
 * so a user can verify every share *before* the expense is submitted to the
 * Stellar network.
 *
 * Precision is delegated to the integer-stroop helpers in `src/lib/split.ts`
 * (Hamilton's largest-remainder method), so the previewed shares always sum
 * to the exact expense amount — no floating-point drift, and the leftover
 * stroop(s) are shown on the participant who received them.
 *
 * The component is controlled: pass `shares` for `custom` (exact amounts) and
 * `percentage` splits. `equal` needs no `shares`. All inputs are validated
 * with Zod (`splitPreviewSchema`) and the computed rows are pure/`useMemo`d,
 * so the same inputs always produce the same preview.
 */

import { useMemo } from "react";
import { z } from "zod";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/amount";
import { FiatInline } from "@/components/FiatEquivalent";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { computeSharesAmounts, fromStroops, toStroops } from "@/lib/split";
import type { ExpenseShareInput, SplitType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Zod validation
// ---------------------------------------------------------------------------

export const splitPreviewParticipantSchema = z.object({
  userId: z.string().min(1, "A participant id is required"),
  displayName: z.string().min(1, "A participant name is required"),
  avatarUrl: z.string().nullable().optional(),
});

export const splitPreviewSchema = z.object({
  amount: z
    .string()
    .regex(
      /^\d+(?:\.\d{1,7})?$/,
      "Amount must be a plain number with up to 7 decimal places"
    ),
  assetCode: z.string().min(1, "Choose an asset"),
  splitType: z.enum(["equal", "custom", "percentage"]),
  participants: z
    .array(splitPreviewParticipantSchema)
    .min(1, "Select at least one participant"),
  shares: z
    .array(
      z.object({
        userId: z.string().min(1),
        amount: z.string().optional(),
        percent: z.number().optional(),
      })
    )
    .optional(),
});

export type SplitPreviewInput = z.infer<typeof splitPreviewSchema>;

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

export interface SplitPreviewParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface SplitPreviewRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Exact 7-decimal share. */
  amount: string;
  /** Share as a percentage of the expense total (2 decimals). */
  percentOfTotal: number;
  /** True when remainder distribution pushed an extra stroop onto this row. */
  remainderAdjusted: boolean;
}

export interface SplitPreviewResult {
  rows: SplitPreviewRow[];
  /** Sum of all shares, 7-decimal string. */
  totalAmount: string;
  amountStroops: bigint;
  totalStroops: bigint;
  /** Whether the shares sum exactly to the requested expense amount. */
  matches: boolean;
  /** Signed decimal string of `total − amount` (e.g. "-0.0000001"). */
  difference: string;
}

/** Weight scaling mirrors `computeSharesAmounts` so remainder flags line up. */
const WEIGHT_SCALE = 1_000_000;

function safeToStroops(value: string | undefined): bigint {
  if (value === undefined) return BigInt(0);
  try {
    const parsed = toStroops(value);
    return parsed > BigInt(0) ? parsed : BigInt(0);
  } catch {
    return BigInt(0);
  }
}

/**
 * Indices whose allocated share exceeds the exact floor of their weighted
 * ideal — i.e. the participants the largest-remainder step topped up.
 */
function remainderFlags(
  total: bigint,
  weights: number[],
  allocated: bigint[]
): boolean[] {
  if (total === BigInt(0)) return weights.map(() => false);
  const scaled = weights.map((w) => BigInt(Math.round(w * WEIGHT_SCALE)));
  const totalScaled = scaled.reduce((sum, w) => sum + w, BigInt(0));
  if (totalScaled === BigInt(0)) return weights.map(() => false);
  return weights.map((_, index) => {
    const floor = (total * scaled[index]) / totalScaled;
    return allocated[index] > floor;
  });
}

/**
 * Compute the itemized split for an expense. Guarantees (for `equal` and
 * `percentage`) that shares sum exactly to the amount; for `custom` it reports
 * the signed difference when the entered amounts do not match.
 */
export function computeSplitPreview(
  amount: string,
  splitType: SplitType,
  participants: SplitPreviewParticipant[],
  shares?: ExpenseShareInput[]
): SplitPreviewResult {
  const amountStroops = toStroops(amount);
  const sharesById = new Map((shares ?? []).map((share) => [share.userId, share]));

  let weights: number[];
  let allocated: bigint[];

  if (splitType === "custom") {
    weights = participants.map(() => WEIGHT_SCALE);
    allocated = participants.map((participant) =>
      safeToStroops(sharesById.get(participant.userId)?.amount)
    );
  } else {
    weights = participants.map((participant) =>
      splitType === "equal" ? 1 : sharesById.get(participant.userId)?.percent ?? 0
    );
    const positive = weights.some((weight) => weight > 0);
    // `computeSharesAmounts` rejects an all-zero weight vector; fall back to a
    // zero allocation so the preview can still render a helpful message.
    allocated = positive
      ? computeSharesAmounts(amountStroops, weights)
      : participants.map(() => BigInt(0));
  }

  const flags = remainderFlags(amountStroops, weights, allocated);
  const totalStroops = allocated.reduce((sum, value) => sum + value, BigInt(0));

  const rows: SplitPreviewRow[] = participants.map((participant, index) => {
    const shareStroops = allocated[index] ?? BigInt(0);
    return {
      userId: participant.userId,
      displayName: participant.displayName,
      avatarUrl: participant.avatarUrl ?? null,
      amount: fromStroops(shareStroops),
      percentOfTotal:
        amountStroops > BigInt(0)
          ? Number((shareStroops * BigInt(10000)) / amountStroops) / 100
          : 0,
      remainderAdjusted: flags[index] ?? false,
    };
  });

  return {
    rows,
    totalAmount: fromStroops(totalStroops),
    amountStroops,
    totalStroops,
    matches: totalStroops === amountStroops,
    difference: fromStroops(totalStroops - amountStroops),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SPLIT_LABELS: Record<SplitType, string> = {
  equal: "Equal",
  custom: "Exact amounts",
  percentage: "Percentage",
};

export interface ExpenseSplitPreviewProps {
  /** Decimal string expense amount, e.g. "42.5000000". */
  amount: string;
  assetCode: string;
  splitType: SplitType;
  participants: SplitPreviewParticipant[];
  /** Required for `custom` and `percentage` splits. */
  shares?: ExpenseShareInput[];
  /** Also show an approximate fiat value per share (opt-in). */
  showFiatEquivalent?: boolean;
  className?: string;
}

export function ExpenseSplitPreview({
  amount,
  assetCode,
  splitType,
  participants,
  shares,
  showFiatEquivalent = false,
  className,
}: ExpenseSplitPreviewProps) {
  const validation = useMemo(
    () =>
      splitPreviewSchema.safeParse({
        amount,
        assetCode,
        splitType,
        participants,
        shares,
      }),
    [amount, assetCode, splitType, participants, shares]
  );
  const validationErrors = validation.success
    ? []
    : validation.error.issues.map((issue) => issue.message);

  const result = useMemo(() => {
    try {
      return computeSplitPreview(amount, splitType, participants, shares);
    } catch {
      return null;
    }
  }, [amount, splitType, participants, shares]);

  const hasAmount = result !== null && result.amountStroops > BigInt(0);
  const anyRemainder = result?.rows.some((row) => row.remainderAdjusted) ?? false;
  const diffStroops = result ? result.totalStroops - result.amountStroops : BigInt(0);

  return (
    <section
      data-testid="split-preview"
      aria-label="Expense split preview"
      className={cn(
        "rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal-sm",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-xs font-bold uppercase tracking-widest">
          Split preview
        </p>
        <Badge tone="grape">{SPLIT_LABELS[splitType]}</Badge>
      </div>

      {validationErrors.length > 0 && (
        <ul
          role="alert"
          className="mt-3 space-y-1 rounded-xl border-2 border-ink bg-flamingo-pale p-3 text-xs font-bold text-ink"
        >
          {validationErrors.map((message) => (
            <li key={message} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {message}
            </li>
          ))}
        </ul>
      )}

      {!hasAmount || !result ? (
        <p className="mt-3 text-sm text-ink/60">
          Enter an amount to preview how it splits between participants.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2" aria-label="Per-participant shares">
            {result.rows.map((row) => (
              <li
                key={row.userId}
                data-testid={`split-row-${row.userId}`}
                data-remainder={row.remainderAdjusted ? "true" : "false"}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-cream px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-butter font-display text-[10px] uppercase"
                  >
                    {initials(row.displayName)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {row.displayName}
                    </span>
                    <span className="block font-mono text-[10px] tabular-nums text-ink/50">
                      {row.percentOfTotal}% of total
                    </span>
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2 text-right">
                  {row.remainderAdjusted && (
                    <Badge tone="butter" title="Receives the rounded remainder stroop">
                      +rounding
                    </Badge>
                  )}
                  <span className="flex flex-col items-end">
                    <Money value={row.amount} assetCode={assetCode} />
                    {showFiatEquivalent && (
                      <FiatInline amount={row.amount} assetCode={assetCode} />
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 space-y-2 border-t-2 border-dashed border-ink/30 pt-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-display text-xs uppercase tracking-widest text-ink/60">
                Total
              </span>
              <Money value={result.totalAmount} assetCode={assetCode} />
            </div>

            {result.matches ? (
              <p
                data-testid="split-total-status"
                className="flex items-center gap-1.5 text-xs font-bold text-lime-dark"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Shares total exactly to the expense amount
                {anyRemainder && " (remainder distributed)"}
              </p>
            ) : (
              <p
                data-testid="split-total-status"
                className="flex items-start gap-1.5 text-xs font-bold text-flamingo-dark"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {diffStroops > BigInt(0)
                  ? `Shares are over by ${fromStroops(diffStroops)} ${assetCode}`
                  : `Shares are short by ${fromStroops(-diffStroops)} ${assetCode}`}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
