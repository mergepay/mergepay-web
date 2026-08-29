"use client";

import { useState } from "react";
import { Check, FileText, Loader2, Receipt, Trash2 } from "lucide-react";
import { ReceiptPreview } from "@/components/ui/receipt-preview";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { FiatEquivalent, FiatInline } from "@/components/FiatEquivalent";
import { Button } from "@/components/ui/button";
import {
  SettleDialog,
  type SettleTarget,
} from "@/components/settle/settle-dialog";
import { useDeleteExpense } from "@/lib/queries";
import { handleApiError } from "@/lib/errorHandler";
import { Timestamp } from "@/components/timestamp";
import { ExpenseReceiptModal } from "@/components/ExpenseReceiptModal";
import type { Expense, GroupMember } from "@/lib/types";

export function ExpenseCard({
  expense,
  groupId,
  currentUserId,
  members,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  expense: Expense;
  groupId: string;
  currentUserId: string;
  members: GroupMember[];
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const del = useDeleteExpense(groupId);

  const isPending = Boolean(expense.isOptimistic || expense.pending);
  const isPayer = expense.payerUserId === currentUserId;
  const myShare = expense.shares.find((s) => s.userId === currentUserId);
  const canDelete = !isPending && isPayer && expense.shares.every((s) => s.status !== "settled");
  const settledCount = expense.shares.filter((s) => s.status === "settled").length;
  // Mirror the per-card "Settle my share" button below: only `pending` shares
  // are directly settleable from the UI; "settling" is server-reconciled.
  const canSelectForBulk =
    !isPending && selectable && !isPayer && !!myShare && myShare.status === "pending";

  async function handleDelete() {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    try {
      await del.mutateAsync(expense.id);
      toast.success("Expense deleted");
    } catch (e) {
      handleApiError(e, "Could not delete");
    }
  }

  function settleMyShare() {
    if (!myShare) return;
    setSettleTarget({
      expenseId: expense.id,
      to: expense.payer,
      amount: myShare.shareAmount,
      assetCode: expense.assetCode,
      assetIssuer: expense.assetIssuer,
      label: `Settle "${expense.title}"`,
    });
  }

  return (
    <Card className={isPending ? "opacity-70 bg-cream/50" : undefined}>
      <div className="flex items-stretch">
        {selectable && (
          <button
            type="button"
            onClick={() => canSelectForBulk && onToggleSelect?.()}
            disabled={!canSelectForBulk}
            aria-label={
              selected
                ? `Deselect expense "${expense.title}"`
                : `Select expense "${expense.title}" for bulk settlement`
            }
            aria-pressed={selected}
            className={`flex shrink-0 items-center justify-center px-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
              canSelectForBulk ? "hover:bg-cream" : "cursor-not-allowed opacity-40"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 items-center justify-center rounded-md border-2 border-ink transition-colors ${
                selected ? "bg-lime shadow-brutal-sm" : "bg-white"
              }`}
            >
              {selected && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-3 p-4 text-left"
          aria-label={`${expanded ? "Collapse" : "Expand"} expense ${expense.title}`}
          aria-expanded={expanded}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-butter shadow-brutal-sm">
            <Avatar user={expense.payer} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-display text-base uppercase tracking-tight">
                {expense.title}
              </p>
              {isPending && (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ink/60" />
                  <Badge tone="paper" className="text-[10px] uppercase">Posting…</Badge>
                </span>
              )}
              {expense.receiptUrl && <FileText className="h-3.5 w-3.5 text-ink/40" />}
            </div>
            <p className="text-xs text-ink/50">
              {expense.payer.displayName}
              {isPayer && " (you)"} paid ·{" "}
              <Timestamp value={expense.createdAt} mode="relative" prefix="Paid" /> ·{" "}
              <span className="capitalize">{expense.splitType}</span>
            </p>
          </div>
          <div className="text-right">
            <Money value={expense.amount} assetCode={expense.assetCode} />
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <AssetBadge code={expense.assetCode} />
              <FiatEquivalent amount={expense.amount} assetCode={expense.assetCode} />
            </div>
          </div>
        </button>
      </div>

      {expanded && (
        <div className="border-t-3 border-ink bg-paper px-4 py-3">
          {expense.description && (
            <p className="mb-3 text-sm text-ink/70">{expense.description}</p>
          )}
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
              Shares · {settledCount}/{expense.shares.length} settled
            </span>
            {expense.memo && (
              <span className="font-mono text-[10px] text-ink/40">
                memo: {expense.memo}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {expense.shares.map((share) => {
              const isMine = share.userId === currentUserId;
              return (
                <div
                  key={share.id}
                  className="flex items-center justify-between rounded-lg border-2 border-ink bg-white px-3 py-1.5"
                >
                  <span className="flex items-center gap-2">
                    <Avatar user={share.user} size="sm" />
                    <span className="text-sm font-bold">
                      {share.user.displayName}
                      {isMine && <span className="ml-1 text-ink/40">(you)</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Money value={share.shareAmount} assetCode={expense.assetCode} />
                    <FiatInline amount={share.shareAmount} assetCode={expense.assetCode} />
                    <Badge tone={statusTone(share.status)}>{share.status}</Badge>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReceiptOpen(true)}
                aria-label={`View receipt for \"${expense.title}\"`}
              >
                <Receipt className="h-3.5 w-3.5" /> Receipt
              </Button>
              {expense.receiptUrl && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewOpen(true)}
                    aria-label={`Preview image receipt for \"${expense.title}\"`}
                  >
                    <FileText className="h-3.5 w-3.5" /> Image
                  </Button>
                </>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  loading={del.isPending}
                  className="text-flamingo"
                  aria-label={`Delete expense "${expense.title}"`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
            {myShare && myShare.status === "pending" && !isPayer && (
              <Button
                size="sm"
                onClick={settleMyShare}
                aria-label={`Settle my share for "${expense.title}"`}
              >
                Settle my share
              </Button>
            )}
          </div>
        </div>
      )}

      <SettleDialog
        open={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        groupId={groupId}
        target={settleTarget}
      />

      {expense.receiptUrl && (
        <ReceiptPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          url={expense.receiptUrl}
          title={`Receipt — ${expense.title}`}
        />
      )}

      <ExpenseReceiptModal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        expense={expense}
      />
    </Card>
  );
}
