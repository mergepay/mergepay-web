"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  FileDown,
  History as HistoryIcon,
  Receipt,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { TxLink } from "@/components/tx-link";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useHistory } from "@/lib/queries";
import { exportHistoryCsv, printReceipt } from "@/lib/export";
import { fullDate } from "@/lib/format";

type Filter = "all" | "expenses" | "settlements";

export default function HistoryPage() {
  const { data, isLoading } = useHistory();
  const [filter, setFilter] = useState<Filter>("all");

  const expenses = useMemo(() => data?.expenses ?? [], [data]);
  const settlements = useMemo(() => data?.settlements ?? [], [data]);

  const hasData = expenses.length > 0 || settlements.length > 0;

  return (
    <>
      <PageHeader
        title="History"
        description="Every expense and on-chain settlement you're part of, with verifiable transaction hashes."
        action={
          hasData && (
            <Button
              variant="outline"
              onClick={() => exportHistoryCsv(expenses, settlements)}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )
        }
      />

      <Tabs
        className="mb-6"
        active={filter}
        onChange={(f) => setFilter(f as Filter)}
        tabs={[
          { id: "all", label: "All" },
          { id: "expenses", label: "Expenses" },
          { id: "settlements", label: "Settlements" },
        ]}
      />

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : !hasData ? (
        <EmptyState
          icon={<HistoryIcon className="h-7 w-7" />}
          title="Nothing here yet"
          description="Your expenses and settlements will appear here once you start using a group."
        />
      ) : (
        <div className="space-y-3">
          {(filter === "all" || filter === "expenses") &&
            expenses.map((e) => (
              <Card key={`e-${e.id}`} className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-butter">
                  <Receipt className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{e.title}</p>
                  <p className="text-xs text-ink/50">
                    {e.payer.displayName} paid · {fullDate(e.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <Money value={e.amount} assetCode={e.assetCode} />
                  <div className="mt-1 flex justify-end">
                    <AssetBadge code={e.assetCode} />
                  </div>
                </div>
              </Card>
            ))}

          {(filter === "all" || filter === "settlements") &&
            settlements.map((s) => (
              <Card
                key={`s-${s.id}`}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-lime">
                  <Zap className="h-4 w-4" />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar user={s.from} size="sm" />
                  <span className="text-sm font-bold">{s.from.displayName}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-ink/40" />
                  <Avatar user={s.to} size="sm" />
                  <span className="text-sm font-bold">{s.to.displayName}</span>
                </div>
                <div className="text-right">
                  <Money value={s.amount} assetCode={s.assetCode} />
                  <div className="mt-1 flex items-center justify-end gap-2">
                    {s.stellarTxHash ? (
                      <TxLink hash={s.stellarTxHash} />
                    ) : (
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    )}
                    <button
                      onClick={() => printReceipt(s)}
                      className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-cream px-2 py-1 text-xs font-bold shadow-brutal-sm hover:bg-butter"
                      aria-label="Print receipt"
                    >
                      <FileDown className="h-3 w-3" /> PDF
                    </button>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </>
  );
}
