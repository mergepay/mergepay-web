"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FileDown,
  History as HistoryIcon,
  Receipt,
  RefreshCcw,
  SearchX,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { HistoryFilterBar } from "@/components/history/HistoryFilterBar";
import { TransactionFilter, type AssetFilter, type StatusFilter } from "@/components/history/TransactionFilter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { SettlementStatusDetail } from "@/components/settle/settlement-status";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpenseListSkeleton } from "@/components/expenses/ExpenseListSkeleton";
import { useInfiniteHistory, accumulateHistoryPages } from "@/lib/queries";
import {
  toHistoryRow,
  matchesHistoryFilters,
  hasActiveFilters,
  sortHistoryRows,
  type HistoryFilters,
} from "@/lib/historyFilter";
import { printReceipt } from "@/lib/export";
import {
  DEFAULT_HISTORY_VIEW,
  readHistoryView,
  writeHistoryView,
  type HistoryKind,
} from "@/lib/history-view";
import { AuditDetails } from "@/components/GroupHistoryExport";
import { GroupExportMenu } from "@/components/groups/GroupExportMenu";
import { Timestamp } from "@/components/timestamp";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Pagination } from "@/components/ui/pagination";
import { useRouter, useSearchParams } from "next/navigation";

type Filter = HistoryKind;
const HISTORY_PAGE_SIZE = 10;

export default function HistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    data: pages,
    isPending,
    isError,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteHistory();

  const [filter, setFilter] = useState<Filter>(DEFAULT_HISTORY_VIEW.kind);
  const [filters, setFilters] = useState<HistoryFilters>(
    DEFAULT_HISTORY_VIEW.filters
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [restored, setRestored] = useState(false);

  const [selectedAsset, setSelectedAsset] = useState<AssetFilter>((searchParams.get("asset") as AssetFilter) || "ALL");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>((searchParams.get("status") as StatusFilter) || "ALL");
  const [startDate, setStartDate] = useState(searchParams.get("start") || "");
  const [endDate, setEndDate] = useState(searchParams.get("end") || "");

  useEffect(() => {
    const stored = readHistoryView();
    setFilter(stored.kind);
    setFilters(stored.filters);
    setSortOrder(stored.sortOrder ?? "newest");
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    writeHistoryView({ kind: filter, filters, sortOrder });
  }, [restored, filter, filters, sortOrder]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedAsset !== "ALL") params.set("asset", selectedAsset);
    else params.delete("asset");
    if (selectedStatus !== "ALL") params.set("status", selectedStatus);
    else params.delete("status");
    if (startDate) params.set("start", startDate);
    else params.delete("start");
    if (endDate) params.set("end", endDate);
    else params.delete("end");

    const queryStr = params.toString();
    const url = queryStr ? `/history?${queryStr}` : "/history";
    router.replace(url, { scroll: false });
  }, [selectedAsset, selectedStatus, startDate, endDate, router, searchParams]);

  const accumulated = useMemo(() => accumulateHistoryPages(pages?.pages), [pages]);

  const expenses = accumulated.expenses;
  const settlements = accumulated.settlements;
  const hasData = expenses.length > 0 || settlements.length > 0;

  const kindItems = useMemo(() => {
    if (filter === "expenses") {
      return expenses.map((e) => ({ type: "expense" as const, item: e, date: e.createdAt }));
    }
    if (filter === "settlements") {
      return settlements.map((s) => ({ type: "settlement" as const, item: s, date: s.createdAt }));
    }
    return sortHistoryRows([
      ...expenses.map((e) => ({ type: "expense" as const, item: e, date: e.createdAt })),
      ...settlements.map((s) => ({ type: "settlement" as const, item: s, date: s.createdAt })),
    ], sortOrder);
  }, [filter, expenses, settlements, sortOrder]);

  const filteredItems = useMemo(
    () =>
      kindItems.filter(({ type, item }) => {
        const row = toHistoryRow({ type, ...item });
        if (!matchesHistoryFilters(row, filters)) return false;
        if (selectedAsset !== "ALL" && row.assetCode !== selectedAsset) return false;
        if (selectedStatus !== "ALL") {
          if (type === "settlement" && item.status.toUpperCase() !== selectedStatus) return false;
          if (type === "expense" && selectedStatus === "PENDING") return false;
        }
        if (startDate && new Date(row.createdAt) < new Date(startDate)) return false;
        if (endDate && new Date(row.createdAt) > new Date(endDate + "T23:59:59")) return false;
        return true;
      }),
    [kindItems, filters, selectedAsset, selectedStatus, startDate, endDate]
  );

  const searching = hasActiveFilters(filters) || selectedAsset !== "ALL" || selectedStatus !== "ALL" || Boolean(startDate) || Boolean(endDate);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / HISTORY_PAGE_SIZE));

  const currentPageItems = useMemo(() => {
    const startIndex = (currentPage - 1) * HISTORY_PAGE_SIZE;
    return filteredItems.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
  }, [filteredItems, currentPage]);

  function handleFilterChange(newFilter: Filter) {
    setFilter(newFilter);
    setFilters((prev) => ({ ...prev, kind: newFilter }));
    setCurrentPage(1);
  }

  function handlePageChange(newPage: number) {
    setCurrentPage(newPage);
    if (newPage > totalPages && hasNextPage) {
      void fetchNextPage();
    }
  }

  function handleResetFilters() {
    setFilters({ kind: filter });
    setSelectedAsset("ALL");
    setSelectedStatus("ALL");
    setStartDate("");
    setEndDate("");
  }

  return (
    <ErrorBoundary onReset={() => void refetch()}>
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
              <GroupExportMenu
                groupId="all"
                expenses={expenses}
                settlements={settlements}
                menuLabel="Export transaction history"
              />
            </div>
          )
        }
      />

      <label className="mb-3 flex items-center gap-2 text-sm font-bold" htmlFor="history-sort">Sort transactions
        <select id="history-sort" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as "newest" | "oldest"); setCurrentPage(1); }} className="rounded-lg border-2 border-ink bg-paper px-3 py-2">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </label>
      <Tabs
        className="mb-6"
        active={filter}
        onChange={(f) => handleFilterChange(f as Filter)}
        tabs={[
          { id: "all", label: "All" },
          { id: "expenses", label: "Expenses" },
          { id: "settlements", label: "Settlements" },
        ]}
      />

      {hasData && (
        <div className="space-y-4 mb-6">
          <HistoryFilterBar value={filters} onChange={setFilters} />
          <TransactionFilter
            selectedAsset={selectedAsset}
            onAssetChange={setSelectedAsset}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            onReset={handleResetFilters}
          />
        </div>
      )}

      {isPending ? (
        <ExpenseListSkeleton count={5} />
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
        <div className="space-y-4">
          {searching && filteredItems.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-7 w-7" />}
              title="No matches"
              description="No transactions match your current filters. Try broadening the search or clearing the filters."
              action={
                <Button variant="outline" onClick={handleResetFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {currentPageItems.map(({ type, item }) => {
                if (type === "expense") {
                  const e = item;
                  return (
                    <Card key={`e-${e.id}`} className="flex items-center gap-3 p-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink bg-butter">
                        <Receipt className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{e.title}</p>
                        <p className="text-xs text-ink/50">
                          {e.payer.displayName} paid · <Timestamp value={e.createdAt} />
                          {e.memo && (
                            <span className="ml-1.5 inline-block font-mono text-[11px] text-ink/70">
                              · Memo: {e.memo}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <Money value={e.amount} assetCode={e.assetCode} />
                        <div className="mt-1 flex justify-end">
                          <AssetBadge code={e.assetCode} />
                        </div>
                      </div>
                    </Card>
                  );
                }

                const s = item;
                return (
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
                      {s.memo && (
                        <p className="mt-1 font-mono text-xs text-ink/70">
                          Memo: {s.memo}
                        </p>
                      )}
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

                    <SettlementStatusDetail
                      settlement={s}
                      className="w-full border-t-2 border-ink/10 pt-3"
                    />
                    <AuditDetails settlement={s} />
                  </Card>
                );
              })}
            </div>
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            totalItems={totalItems}
            pageSize={HISTORY_PAGE_SIZE}
          />

          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => void fetchNextPage()}
                loading={isFetchingNextPage}
              >
                Load more pages
              </Button>
            </div>
          )}
        </div>
      )}
    </ErrorBoundary>
  );
}
