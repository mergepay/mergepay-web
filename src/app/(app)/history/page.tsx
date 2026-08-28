"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Download,
  FileDown,
  History as HistoryIcon,
  Receipt,
  RefreshCcw,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { SettlementStatusDetail } from "@/components/settle/settlement-status";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useInfiniteHistory, accumulateHistoryPages } from "@/lib/queries";
import { exportHistoryCsv, printReceipt } from "@/lib/export";
import { Timestamp } from "@/components/timestamp";

type Filter = "all" | "expenses" | "settlements";

export default function HistoryPage() {
  const {
    data: pages,
    isLoading,
    isError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteHistory();

  const [filter, setFilter] = useState<Filter>("all");

  // Accumulate all loaded pages into a single deduplicated set sorted
  // newest-first — mergeHistoryPages keeps stable order across refetches.
  const accumulated = useMemo(() => accumulateHistoryPages(pages?.pages), [pages]);

  const expenses = accumulated.expenses;
  const settlements = accumulated.settlements;
  const hasData = expenses.length > 0 || settlements.length > 0;

  return (
    <>
      <PageHeader
        title="History"
        description="Every expense and on-chain settlement you're part of, with verifiable transaction hashes."
        action={
          hasData && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => refetch()}
                loading={isFetching}
                aria-label="Refresh history"
              >
                <RefreshCcw className="h-4 w-4" /> Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => exportHistoryCsv(expenses, settlements)}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
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
      ) : isError ? (
        <EmptyState
          icon={<HistoryIcon className="h-7 w-7 text-red-500" />}
          title="Error loading history"
          description="We couldn't load your transaction history."
          action={
            <Button onClick={() => refetch()} variant="outline">
              Retry
            </Button>
          }
        />
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
                    {e.payer.displayName} paid · <Timestamp value={e.createdAt} />
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
                className="flex flex-wrap items-start gap-3 p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-lime">
                  <Zap className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Avatar user={s.from} size="sm" />
                    <span className="text-sm font-bold">{s.from.displayName}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-ink/40" />
                    <Avatar user={s.to} size="sm" />
                    <span className="text-sm font-bold">{s.to.displayName}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Money value={s.amount} assetCode={s.assetCode} />
                  <button
                    onClick={() => printReceipt(s)}
                    className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-cream px-2 py-1 text-xs font-bold shadow-brutal-sm hover:bg-butter"
                    aria-label={`Print receipt for the settlement from ${s.from.displayName} to ${s.to.displayName}`}
                  >
                    <FileDown className="h-3 w-3" aria-hidden="true" /> PDF
                  </button>
                </div>

                {/* Status gets its own full-width row so the explanation
                    stays readable at mobile widths. */}
                <SettlementStatusDetail
                  settlement={s}
                  className="w-full border-t-2 border-ink/10 pt-3"
                />
              </Card>
            ))}

          {/* Load-more control — hidden when all pages are loaded */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                loading={isFetchingNextPage}
                aria-label="Load more history"
              >
                {isFetchingNextPage ? "Loading…" : "Load More"}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
