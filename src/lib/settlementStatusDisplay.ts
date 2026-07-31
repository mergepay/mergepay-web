/**
 * Presentation rules for settlement status.
 *
 * `SettlementStatus` in `./types` stays the source of truth for the
 * values the API can return; this module is the single place that turns
 * one of those values into what the user reads. History, the ledger, and
 * any future consumer share it so a status never means one thing in one
 * view and something else in another.
 *
 * Deliberately free of React so the rules can be unit-tested directly.
 */

import type { Settlement, SettlementStatus } from "./types";

/**
 * The coarse state a settlement is in, from the user's point of view.
 *
 * `unknown` covers values the API may introduce later — the UI degrades
 * to a readable, non-committal state rather than mislabelling an
 * unfinished payment as done.
 */
export type SettlementStatusKind = "pending" | "completed" | "failed" | "unknown";

/** Badge tones available in `@/components/ui/badge`. */
export type SettlementStatusTone = "lime" | "butter" | "flamingo" | "paper";

export interface SettlementStatusView {
  kind: SettlementStatusKind;
  /** Short label for the status badge. */
  label: string;
  tone: SettlementStatusTone;
  /**
   * One sentence of plain text explaining what actually happened —
   * the last known action for a pending payment, the confirmation for a
   * completed one, the recovery instruction for a failed one.
   */
  detail: string;
  /**
   * Whether the record is in a state where starting a *fresh* settlement
   * is safe. False while a payment is in flight, so the UI never invites
   * a duplicate payment, and false for unknown states.
   */
  canRecover: boolean;
  /**
   * Whether the payment is still in flight. Consumers use this to
   * suppress any action that would submit a second transaction.
   */
  isInFlight: boolean;
}

const VIEWS: Record<SettlementStatus, SettlementStatusView> = {
  pending: {
    kind: "pending",
    label: "Pending",
    tone: "butter",
    detail:
      "Payment created and waiting to be submitted to Stellar. Nothing has left your account yet.",
    canRecover: false,
    isInFlight: true,
  },
  submitted: {
    kind: "pending",
    label: "Awaiting confirmation",
    tone: "butter",
    detail:
      "Submitted to Stellar and waiting for the network to confirm it. This usually takes a few seconds.",
    canRecover: false,
    isInFlight: true,
  },
  confirmed: {
    kind: "completed",
    label: "Completed",
    tone: "lime",
    detail: "Confirmed on the Stellar ledger.",
    canRecover: false,
    isInFlight: false,
  },
  failed: {
    kind: "failed",
    label: "Failed",
    tone: "flamingo",
    detail:
      "Stellar did not accept this payment, so the balance was not settled. Open the group to review balances and start a new settlement.",
    canRecover: true,
    isInFlight: false,
  },
};

/** Longest raw status we will echo back into the UI. */
const MAX_LABEL_LENGTH = 32;

/**
 * Turn an unrecognized API status into something readable without
 * echoing arbitrary content into the page: keep letters, digits, spaces,
 * hyphens and underscores, collapse separators to spaces, cap the
 * length, and fall back to "Unknown" when nothing usable is left.
 */
export function humanizeUnknownStatus(raw: unknown): string {
  if (typeof raw !== "string") return "Unknown";
  const cleaned = raw
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_LENGTH)
    .trim();
  if (!cleaned) return "Unknown";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function isKnownStatus(status: unknown): status is SettlementStatus {
  return typeof status === "string" && status in VIEWS;
}

/**
 * Describe any settlement status, including values this build does not
 * know about.
 */
export function describeSettlementStatus(status: unknown): SettlementStatusView {
  if (isKnownStatus(status)) return VIEWS[status];

  return {
    kind: "unknown",
    label: humanizeUnknownStatus(status),
    tone: "paper",
    detail:
      "This payment is in a state Mergepay does not recognize yet. Check the group ledger for the latest state before paying again.",
    canRecover: false,
    // Treat an unrecognized status as potentially in flight: it is the
    // conservative reading, and it keeps any "pay again" affordance hidden.
    isInFlight: true,
  };
}

/**
 * Whether a settlement carries transaction metadata worth rendering.
 * Only a non-empty hash counts — the explorer link itself is validated
 * separately by `explorerTxUrl`.
 */
export function hasTransactionMetadata(
  settlement: Pick<Settlement, "stellarTxHash">
): boolean {
  return (
    typeof settlement.stellarTxHash === "string" &&
    settlement.stellarTxHash.trim().length > 0
  );
}

/**
 * Drop duplicate records by id, keeping the first occurrence.
 *
 * Refetching history can overlap with an in-flight settlement update, so
 * the same settlement (or expense) can appear twice in a merged list.
 * Rendering is keyed by id, and React would warn — and the user would
 * see the payment twice — without this.
 */
export function dedupeById<T extends { id: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out;
}
