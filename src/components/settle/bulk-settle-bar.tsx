"use client";

import {
  filterUnsettledShares,
  buildBulkTarget,
  estimateBulkFee,
  sumSelectedAmounts,
  type UnsettledShare,
} from "@/lib/bulkSettle";
import { Money } from "@/components/amount";
import { Button } from "@/components/ui/button";
import type { Expense } from "@/lib/types";
import { Trash2, Wallet } from "lucide-react";

export function BulkSettleBar({
  expenses,
  currentUserId,
  selectedIds,
  onClear,
  onProceed,
}: {
  expenses: Expense[];
  currentUserId: string;
  selectedIds: string[];
  onClear: () => void;
  onProceed: (shares: UnsettledShare[]) => void;
}) {
  const unsettled = filterUnsettledShares(expenses, currentUserId);
  const byId = new Map(unsettled.map((s) => [s.expenseId, s]));
  // Resolve the actual unsettle shares for the selection, preserving order.
  const selectedShares: UnsettledShare[] = selectedIds
    .map((id) => byId.get(id))
    .filter((s): s is UnsettledShare => Boolean(s));

  const count = selectedShares.length;
  if (count === 0) return null;

  const { error } = buildBulkTarget(selectedShares);
  const total = sumSelectedAmounts(selectedShares);
  const fee = estimateBulkFee(count);
  const recipientIds = new Set(selectedShares.map((s) => s.payerUserId));
  const sameRecipient = recipientIds.size <= 1;

  return (
    <div
      role="region"
      aria-label="Bulk settle selection"
      className="sticky bottom-3 z-30 mx-auto mt-6 max-w-2xl rounded-2xl border-3 border-ink bg-cream p-4 shadow-brutal"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-sm uppercase tracking-widest">
              {count} selected
            </span>
            <span className="text-ink/40">·</span>
            <Money value={total} assetCode={selectedShares[0].assetCode} />
          </div>
          {!sameRecipient && (
            <p className="mt-1 text-xs text-flamingo">
              Mixed recipients — pick only expenses to the same person.
            </p>
          )}
          {sameRecipient && selectedShares[0] && (
            <p className="mt-1 text-xs text-ink/60">
              To {selectedShares[0].payer.displayName} · Est. network fee{" "}
              <span className="font-mono">~{fee} XLM</span>
            </p>
          )}
          {error && (
            <p className="mt-1 text-xs text-flamingo">{error.message}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button
            size="sm"
            onClick={() => onProceed(selectedShares)}
            disabled={!sameRecipient || error !== null}
            aria-label={`Settle ${count} selected expense${count === 1 ? "" : "s"}`}
          >
            <Wallet className="h-4 w-4" />
            {count === 1 ? "Settle 1 expense" : `Settle ${count} expenses`}
          </Button>
        </div>
      </div>
    </div>
  );
}
