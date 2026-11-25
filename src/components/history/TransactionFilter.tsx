"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AssetFilter = "ALL" | "XLM" | "USDC";
export type StatusFilter = "ALL" | "PENDING" | "SETTLED";

export interface TransactionFilterProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  selectedAsset: AssetFilter;
  onAssetChange: (asset: AssetFilter) => void;
  selectedStatus: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  startDate?: string;
  onStartDateChange?: (date: string) => void;
  endDate?: string;
  onEndDateChange?: (date: string) => void;
  onReset?: () => void;
  className?: string;
}

import { getStoredGroupPreferences, setStoredGroupPreferences } from "@/lib/storage";

export function TransactionFilter({
  searchQuery = "",
  onSearchChange,
  selectedAsset,
  onAssetChange,
  selectedStatus,
  onStatusChange,
  startDate = "",
  onStartDateChange,
  endDate = "",
  onEndDateChange,
  onReset,
  className,
}: TransactionFilterProps) {
  const assets: AssetFilter[] = ["ALL", "XLM", "USDC"];
  const statuses: StatusFilter[] = ["ALL", "PENDING", "SETTLED"];

  React.useEffect(() => {
    const stored = getStoredGroupPreferences();
    if (stored.historyFilters && typeof stored.historyFilters === "object") {
      const hf = stored.historyFilters as Record<string, unknown>;
      if (typeof hf.selectedAsset === "string" && onAssetChange) {
        onAssetChange(hf.selectedAsset as AssetFilter);
      }
      if (typeof hf.selectedStatus === "string" && onStatusChange) {
        onStatusChange(hf.selectedStatus as StatusFilter);
      }
      if (typeof hf.searchQuery === "string" && onSearchChange) {
        onSearchChange(hf.searchQuery);
      }
      if (typeof hf.startDate === "string" && onStartDateChange) {
        onStartDateChange(hf.startDate);
      }
      if (typeof hf.endDate === "string" && onEndDateChange) {
        onEndDateChange(hf.endDate);
      }
    }
  }, []);

  const updateHistoryStorage = (partial: Record<string, unknown>) => {
    const current = getStoredGroupPreferences();
    const historyFilters = {
      ...(current.historyFilters || {}),
      selectedAsset,
      selectedStatus,
      searchQuery,
      startDate,
      endDate,
      ...partial,
    };
    setStoredGroupPreferences({ historyFilters });
  };

  const hasActiveFilters =
    selectedAsset !== "ALL" ||
    selectedStatus !== "ALL" ||
    Boolean(searchQuery.trim()) ||
    Boolean(startDate) ||
    Boolean(endDate);

  return (
    <div
      role="search"
      aria-label="Transaction history filters"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border-3 border-ink bg-paper p-3 sm:p-4 shadow-brutal-sm",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {onSearchChange && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                updateHistoryStorage({ searchQuery: e.target.value });
              }}
              placeholder="Search by title, memo or participant..."
              aria-label="Search transactions"
              className="w-full rounded-xl border-2 border-ink bg-cream pl-9 pr-3 py-1.5 font-mono text-xs text-ink placeholder:text-ink/40 outline-none focus:ring-2 focus:ring-grape"
            />
          </div>
        )}

        {hasActiveFilters && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center justify-center gap-1 self-end sm:self-auto rounded-lg border-2 border-ink bg-flamingo-pale px-2.5 py-1 text-xs font-bold text-ink shadow-brutal-sm hover:bg-flamingo transition-colors"
            aria-label="Reset all filters"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        {/* Asset Filter Group */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by asset type">
          <span className="font-display uppercase tracking-widest text-ink/60 font-bold mr-1">
            Asset:
          </span>
          {assets.map((asset) => {
            const isSelected = selectedAsset === asset;
            return (
              <button
                key={asset}
                type="button"
                onClick={() => {
                onAssetChange(asset);
                updateHistoryStorage({ selectedAsset: asset });
              }}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-lg border-2 border-ink px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider transition-all shadow-brutal-sm",
                  isSelected
                    ? "bg-grape text-white shadow-none"
                    : "bg-cream text-ink hover:bg-butter"
                )}
              >
                {asset}
              </button>
            );
          })}
        </div>

        {/* Status Filter Group */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by settlement status">
          <span className="font-display uppercase tracking-widest text-ink/60 font-bold mr-1">
            Status:
          </span>
          {statuses.map((status) => {
            const isSelected = selectedStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => {
                onStatusChange(status);
                updateHistoryStorage({ selectedStatus: status });
              }}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-lg border-2 border-ink px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider transition-all shadow-brutal-sm",
                  isSelected
                    ? status === "SETTLED"
                      ? "bg-lime text-ink shadow-none"
                      : status === "PENDING"
                      ? "bg-butter text-ink shadow-none"
                      : "bg-grape text-white shadow-none"
                    : "bg-cream text-ink hover:bg-butter"
                )}
              >
                {status}
              </button>
            );
          })}
        </div>

        {/* Date Range Picker Group */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t-2 border-ink/10 w-full" role="group" aria-label="Filter by date range">
          <span className="font-display uppercase tracking-widest text-ink/60 font-bold mr-1">
            Date Range:
          </span>
          <div className="flex items-center gap-1">
            <label htmlFor="start-date" className="text-[10px] font-bold text-ink/70 uppercase">From</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => {
                onStartDateChange?.(e.target.value);
                updateHistoryStorage({ startDate: e.target.value });
              }}
              aria-label="Start date"
              className="rounded-lg border-2 border-ink bg-cream px-2 py-1 font-mono text-xs text-ink outline-none focus:ring-2 focus:ring-grape"
            />
          </div>
          <div className="flex items-center gap-1">
            <label htmlFor="end-date" className="text-[10px] font-bold text-ink/70 uppercase">To</label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => {
                onEndDateChange?.(e.target.value);
                updateHistoryStorage({ endDate: e.target.value });
              }}
              aria-label="End date"
              className="rounded-lg border-2 border-ink bg-cream px-2 py-1 font-mono text-xs text-ink outline-none focus:ring-2 focus:ring-grape"
            />
          </div>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                onStartDateChange?.("");
                onEndDateChange?.("");
              }}
              className="text-xs font-bold text-grape hover:underline ml-2"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
