"use client";

import { Search, X, FilterX } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SETTLEMENT_ASSETS } from "@/lib/constants";
import type { HistoryFilters } from "@/lib/historyFilter";

export interface HistoryFilterBarProps {
  value: HistoryFilters;
  onChange: (next: HistoryFilters) => void;
}

function countActive(filters: HistoryFilters): number {
  let n = 0;
  if (filters.keyword) n++;
  if (filters.assetCode) n++;
  if (filters.participant) n++;
  if (filters.fromDate) n++;
  if (filters.toDate) n++;
  return n;
}

/**
 * Search + filter bar for the transaction history view. Everything is
 * controllable: the parent owns the `HistoryFilters` state and drives the
 * `onChange` callback. Styled to match the neobrutalist design tokens
 * (thick ink borders, hard offset shadow, high contrast).
 */
export function HistoryFilterBar({ value, onChange }: HistoryFilterBarProps) {
  const activeCount = countActive(value);

  const assetCodes = useMemoAssetOptions();

  // Grouped event handlers keep the JSX tidy and avoid inline closures.
  const setKeyword = (keyword: string) => onChange({ ...value, keyword });
  const setAssetCode = (assetCode: string) => onChange({ ...value, assetCode });
  const setParticipant = (participant: string) =>
    onChange({ ...value, participant });
  const setFromDate = (fromDate: string) => onChange({ ...value, fromDate });
  const setToDate = (toDate: string) => onChange({ ...value, toDate });
  const clearAll = () => onChange({ kind: "all" });
  const clearKeyword = () => onChange({ ...value, keyword: undefined });

  const hasFilters = activeCount > 0;

  return (
    <div
      role="search"
      aria-label="Search and filter transaction history"
      className="mb-6 space-y-3 rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50"
            aria-hidden="true"
          />
          <Input
            aria-label="Search history"
            placeholder="Search title, memo, or person…"
            className="pl-10 pr-10"
            value={value.keyword ?? ""}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {value.keyword && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={clearKeyword}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink/60 hover:bg-cream hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {hasFilters && (
          <Button variant="outline" size="sm" onClick={clearAll}>
            <FilterX className="h-4 w-4" aria-hidden="true" />
            Clear ({activeCount})
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="history-asset"
            className="mb-1 block font-display text-xs uppercase tracking-widest text-ink"
          >
            Currency
          </label>
          <Select
            id="history-asset"
            aria-label="Filter by currency"
            className={cn(!value.assetCode && "text-ink/40")}
            value={value.assetCode ?? ""}
            onChange={(e) => setAssetCode(e.target.value)}
          >
            <option value="">All currencies</option>
            {assetCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label
            htmlFor="history-participant"
            className="mb-1 block font-display text-xs uppercase tracking-widest text-ink"
          >
            Person
          </label>
          <Input
            id="history-participant"
            aria-label="Filter by participant"
            placeholder="Name…"
            value={value.participant ?? ""}
            onChange={(e) => setParticipant(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="history-from"
            className="mb-1 block font-display text-xs uppercase tracking-widest text-ink"
          >
            From
          </label>
          <Input
            id="history-from"
            type="date"
            aria-label="Filter from date"
            value={value.fromDate ?? ""}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="history-to"
            className="mb-1 block font-display text-xs uppercase tracking-widest text-ink"
          >
            To
          </label>
          <Input
            id="history-to"
            type="date"
            aria-label="Filter to date"
            value={value.toDate ?? ""}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/** Distinct configured settlement asset codes for the currency dropdown. */
function useMemoAssetOptions(): string[] {
  // Derived once per render; SETTLEMENT_ASSETS is static config.
  return Array.from(
    new Set(SETTLEMENT_ASSETS.map((a) => a.code).filter(Boolean))
  );
}