/**
 * Pure helpers for bulk settlement (issue #31).
 *
 * The decimal-7 ↔ stroops conversion helpers (`toStroops`, `fromStroops`)
 * are inlined here intentionally. The project's `src/lib/split.ts` stroops
 * utilities only ship on feature branches not yet merged to `main`, so
 * depending on `./split` would break this module against a clean main
 * checkout. The helpers are small and keep the bulk-settlement commit
 * self-contained on `origin/main`.
 *
 * TODO(mergepay-api): remove the inlined stroops helpers and re-import
 * from `./split` once src/lib/split.ts (or a more dedicated stroops util)
 * lands on main. Drift between this copy and split.ts will silently break
 * the bulk path.
 *
 * Kept dependency-free (no React, no network) so each rule can be exercised
 * by a Vitest unit test in isolation.
 */

import type { Expense, User } from "./types";

// ---------------------------------------------------------------------------
// Decimal-7 ↔ stroops (BigInt) helpers, inlined from src/lib/split.ts.
// 1 XLM = 10,000,000 stroops. We always carry 7 decimal places on the wire.
// We avoid BigInt literal syntax (`...n`) so the source compiles against
// tsconfigs targeting ES2019 and below.
// ---------------------------------------------------------------------------

const STROOPS_PER_UNIT = BigInt("10000000");

function toStroops(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toFixed(7) : amount;
  // Tolerate a trailing dot ("50.") by padding one zero before splitting.
  const normalized = s.endsWith(".") ? `${s}0` : s;
  // Default int to "0" so a leading dot (".5") parses to 0.5 stroops; let
  // BigInt("-") and other garbage throw so upstream callers surface bad input
  // instead of silently getting wrong totals.
  const [int = "0", frac = ""] = normalized.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return BigInt(int) * STROOPS_PER_UNIT + BigInt(padded);
}

function fromStroops(amount: bigint): string {
  const negative = amount < BigInt(0);
  const abs = negative ? -amount : amount;
  const intPart = abs / STROOPS_PER_UNIT;
  const fracPart = abs % STROOPS_PER_UNIT;
  return `${negative ? "-" : ""}${intPart}.${fracPart.toString().padStart(7, "0")}`;
}

// ---------------------------------------------------------------------------
// Public surface.
// ---------------------------------------------------------------------------

export type BulkValidationErrorCode =
  | "no_selection"
  | "mismatched_recipient";

export interface BulkValidationError {
  code: BulkValidationErrorCode;
  message: string;
}

export interface UnsettledShare {
  expenseId: string;
  expenseTitle: string;
  payerUserId: string;
  payer: User;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
}

/**
 * Filter `expenses` down to the shares the current user could settle, i.e.
 * the ones with a non-settled share belonging to them, on an expense someone
 * else paid (you can't settle your own payment).
 */
export function filterUnsettledShares(
  expenses: Expense[],
  currentUserId: string
): UnsettledShare[] {
  const out: UnsettledShare[] = [];
  for (const expense of expenses) {
    if (expense.payerUserId === currentUserId) continue;
    const share = expense.shares.find(
      (s) => s.userId === currentUserId && s.status !== "settled"
    );
    if (!share) continue;
    out.push({
      expenseId: expense.id,
      expenseTitle: expense.title,
      payerUserId: expense.payerUserId,
      payer: expense.payer,
      amount: share.shareAmount,
      assetCode: expense.assetCode,
      assetIssuer: expense.assetIssuer,
    });
  }
  return out;
}

/**
 * Validate that every selected share resolves to the same settlement recipient.
 *
 * In Mergepay's data model the original `Expense.payerUserId` and the
 * `Settlement.toUserId` are the same user — the debtor (the caller) is
 * settling their share *to* the person who originally paid the bill.
 * Enforcing "all `payerUserId`s are equal" is therefore exactly the
 * "all selected expenses go to the same recipient" constraint called for
 * by issue #31.
 *
 * Returns `null` on success, otherwise a structured error with a
 * user-facing message safe to render in the bulk-settle bar/dialog.
 */
export function validateSameRecipient(
  selected: UnsettledShare[]
): BulkValidationError | null {
  if (selected.length === 0) {
    return {
      code: "no_selection",
      message: "Select at least one expense to settle.",
    };
  }
  const recipientIds = new Set(selected.map((s) => s.payerUserId));
  if (recipientIds.size > 1) {
    return {
      code: "mismatched_recipient",
      message:
        "All selected expenses must go to the same recipient. Settle expenses to other people in separate payments.",
    };
  }
  return null;
}

/**
 * Sum share amounts of selected unsettled shares using integer math so the
 * total is exact (no decimal drift). Returns a decimal-7 string.
 */
export function sumSelectedAmounts(selected: UnsettledShare[]): string {
  let total = BigInt(0);
  for (const s of selected) total += toStroops(s.amount);
  return fromStroops(total);
}

/**
 * Estimate the Stellar network fee for a batched settlement.
 *
 * Each payment operation costs 100 stroops; we add one extra op for the
 * transaction envelope itself. Numbers are stable in practice, so a static
 * estimate is plenty for an in-app preview.
 */
export function estimateBulkFee(paymentCount: number): string {
  const n = Math.max(1, paymentCount);
  const stroops = 100 + 100 * n;
  return fromStroops(BigInt(stroops));
}

/**
 * Build a `BulkSettleTarget` (consumable by `SettleDialog` in bulk mode)
 * from a selection of unsettled shares. Returns `null` if the selection is
 * invalid — callers should surface the error message.
 *
 * Note on scope: the issue also lists "current user is payer" as an
 * alternative condition. `filterUnsettledShares` already strips expenses
 * where the caller is the payer (you can't settle your own payment), so
 * that branch is implicitly excluded by the time input reaches this
 * function — we only enforce the same-recipient invariant here.
 */
export function buildBulkTarget(
  selected: UnsettledShare[]
): {
  target: {
    expenseIds: string[];
    to: User;
    amount: string;
    assetCode: string;
    assetIssuer: string | null;
    label: string;
  } | null;
  error: BulkValidationError | null;
} {
  const error = validateSameRecipient(selected);
  if (error) return { target: null, error };
  const first = selected[0];
  return {
    error: null,
    target: {
      expenseIds: selected.map((s) => s.expenseId),
      to: first.payer,
      amount: sumSelectedAmounts(selected),
      assetCode: first.assetCode,
      assetIssuer: first.assetIssuer,
      label: `Settle ${selected.length} expense${selected.length === 1 ? "" : "s"} with ${first.payer.displayName}`,
    },
  };
}
