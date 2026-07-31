"use client";

import { useMemo } from "react";
import { ArrowRight, Landmark, Receipt, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Money } from "@/components/amount";
import { TxLink } from "@/components/tx-link";
import { SettlementStatusBadge } from "@/components/settle/settlement-status";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  accumulateLedgerPages,
  useInfiniteLedger,
} from "@/lib/queries";
import { Timestamp } from "@/components/timestamp";

export function LedgerPanel({ groupId }: { groupId: string }) {
  const {
    data: pages,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteLedger(groupId);

  const entries = useMemo(
    () => accumulateLedgerPages(pages?.pages),
    [pages?.pages]
  );

  if (isLoading) return <ListSkeleton rows={4} />;

  if (isError) {
    return (
      <EmptyState
        icon={<Receipt className="h-7 w-7 text-red-500" />}
        title="Error loading ledger"
        description="We couldn't load the transaction history for this group."
        action={
          <Button onClick={() => refetch()} variant="outline">
            Retry
          </Button>
        }
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-7 w-7" />}
        title="Ledger is empty"
        description="Expenses, settlements, and treasury moves will appear here in order."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative space-y-3 before:absolute before:left-[21px] before:top-2 before:h-[calc(100%-1rem)] before:w-0.5 before:bg-ink/15">
      {entries.map((entry, i) => (
        <div key={i} className="relative flex gap-3">
          <LedgerIcon type={entry.type} />
          <Card className="flex-1 p-3">
            {entry.type === "expense" && (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{entry.expense.title}</p>
                  <p className="text-xs text-ink/50">
                    {entry.expense.payer.displayName} paid ·{" "}
                    <Timestamp value={entry.createdAt} />
                  </p>
                </div>
                <Money
                  value={entry.expense.amount}
                  assetCode={entry.expense.assetCode}
                />
              </div>
            )}
            {entry.type === "settlement" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 font-bold">
                    {entry.settlement.from.displayName}
                    <ArrowRight className="h-3.5 w-3.5 text-ink/40" />
                    {entry.settlement.to.displayName}
                  </p>
                  <p className="text-xs text-ink/50">
                    <Timestamp value={entry.createdAt} />
                  </p>
                </div>
                <div className="text-right">
                  <Money
                    value={entry.settlement.amount}
                    assetCode={entry.settlement.assetCode}
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                    <SettlementStatusBadge status={entry.settlement.status} />
                    {entry.settlement.stellarTxHash && (
                      <TxLink hash={entry.settlement.stellarTxHash} />
                    )}
                  </div>
                </div>
              </div>
            )}
            {entry.type === "treasury" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold capitalize">
                    Treasury {entry.treasuryTransaction.direction}
                  </p>
                  <p className="text-xs text-ink/50">
                    <Timestamp value={entry.createdAt} />
                  </p>
                </div>
                <div className="text-right">
                  <Money
                    value={entry.treasuryTransaction.amount}
                    assetCode={entry.treasuryTransaction.assetCode}
                  />
                  <div className="mt-1 flex justify-end">
                    {entry.treasuryTransaction.stellarTxHash ? (
                      <TxLink hash={entry.treasuryTransaction.stellarTxHash} />
                    ) : (
                      <Badge tone={statusTone(entry.treasuryTransaction.status)}>
                        {entry.treasuryTransaction.status.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      ))}
      </div>
      {/* Load-more control — hidden when all pages are loaded */}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            loading={isFetchingNextPage}
            aria-label="Load more ledger entries"
          >
            {isFetchingNextPage ? "Loading…" : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}

function LedgerIcon({ type }: { type: "expense" | "settlement" | "treasury" }) {
  const map = {
    expense: { icon: <Receipt className="h-4 w-4" />, bg: "bg-butter" },
    settlement: { icon: <Zap className="h-4 w-4" />, bg: "bg-lime" },
    treasury: { icon: <Landmark className="h-4 w-4" />, bg: "bg-aqua" },
  } as const;
  const { icon, bg } = map[type];
  return (
    <span
      className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-3 border-ink shadow-brutal-sm ${bg}`}
    >
      {icon}
    </span>
  );
}
