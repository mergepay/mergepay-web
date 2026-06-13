"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { Button } from "@/components/ui/button";
import { SettleDialog, type SettleTarget } from "@/components/settle/settle-dialog";
import { useDeleteExpense } from "@/lib/queries";
import { ApiRequestError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { Expense, GroupMember } from "@/lib/types";

export function ExpenseCard({
  expense,
  groupId,
  currentUserId,
  members,
}: {
  expense: Expense;
  groupId: string;
  currentUserId: string;
  members: GroupMember[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const del = useDeleteExpense(groupId);

  const isPayer = expense.payerUserId === currentUserId;
  const myShare = expense.shares.find((s) => s.userId === currentUserId);
  const canDelete = isPayer && expense.shares.every((s) => s.status !== "settled");
  const settledCount = expense.shares.filter((s) => s.status === "settled").length;

  async function handleDelete() {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    try {
      await del.mutateAsync(expense.id);
      toast.success("Expense deleted");
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not delete");
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
    <Card>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-butter shadow-brutal-sm">
          <Avatar user={expense.payer} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-display text-base uppercase tracking-tight">
              {expense.title}
            </p>
            {expense.receiptUrl && <FileText className="h-3.5 w-3.5 text-ink/40" />}
          </div>
          <p className="text-xs text-ink/50">
            {expense.payer.displayName}
            {isPayer && " (you)"} paid · {timeAgo(expense.createdAt)} ·{" "}
            <span className="capitalize">{expense.splitType}</span>
          </p>
        </div>
        <div className="text-right">
          <Money value={expense.amount} assetCode={expense.assetCode} />
          <div className="mt-1 flex justify-end gap-1">
            <AssetBadge code={expense.assetCode} />
          </div>
        </div>
      </button>

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
                    <Badge tone={statusTone(share.status)}>{share.status}</Badge>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {expense.receiptUrl && (
                <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">
                    <FileText className="h-3.5 w-3.5" /> Receipt
                  </Button>
                </a>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  loading={del.isPending}
                  className="text-flamingo"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
            {myShare && myShare.status === "pending" && !isPayer && (
              <Button size="sm" onClick={settleMyShare}>
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
    </Card>
  );
}
