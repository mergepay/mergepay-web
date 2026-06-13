"use client";

import { ArrowRight, Landmark, Receipt, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Money } from "@/components/amount";
import { TxLink } from "@/components/tx-link";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useLedger } from "@/lib/queries";
import { fullDate } from "@/lib/format";

export function LedgerPanel({ groupId }: { groupId: string }) {
  const { data, isLoading } = useLedger(groupId);

  if (isLoading) return <ListSkeleton rows={4} />;

  const entries = data?.entries ?? [];
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
                    {entry.expense.payer.displayName} paid · {fullDate(entry.createdAt)}
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
                  <p className="text-xs text-ink/50">{fullDate(entry.createdAt)}</p>
                </div>
                <div className="text-right">
                  <Money
                    value={entry.settlement.amount}
                    assetCode={entry.settlement.assetCode}
                  />
                  <div className="mt-1 flex justify-end">
                    {entry.settlement.stellarTxHash ? (
                      <TxLink hash={entry.settlement.stellarTxHash} />
                    ) : (
                      <Badge tone={statusTone(entry.settlement.status)}>
                        {entry.settlement.status}
                      </Badge>
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
                  <p className="text-xs text-ink/50">{fullDate(entry.createdAt)}</p>
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
