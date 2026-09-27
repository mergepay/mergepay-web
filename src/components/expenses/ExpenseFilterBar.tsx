"use client";

/**
 * Reusable search & filter bar for expense and activity lists (#356).
 *
 * Fully controlled: it renders `value` and reports edits through `onChange`,
 * holding no state of its own, so the owner decides where filter state lives
 * (component state, the URL, or a query hook's params). Matching is done by
 * the pure predicates in `src/lib/expenseFilters.ts`.
 *
 * Optional sections — participant search and settlement status — are toggled
 * by props, and extra owner-specific controls can be passed as `children`.
 */

import { useId, type ReactNode } from "react";
import { CheckCircle2, CircleDollarSign, Clock, FilterX, Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SETTLEMENT_ASSETS } from "@/lib/constants";
import type { ExpenseFilterValues, ExpenseStatusFilter } from "@/lib/expenseFilters";

export interface ActivityFilters extends ExpenseFilterValues {
  participant?: string;
}

export interface ExpenseFilterBarProps {
  value: ActivityFilters;
  onChange: (next: ActivityFilters) => void;
  /** Accessible name of the search landmark. */
  label?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** Free-text participant filter (activity feed). Default: shown. */
  showParticipant?: boolean;
  /** Settled / pending toggle. Default: hidden. */
  showStatus?: boolean;
  /** Asset codes to offer. Default: the configured settlement assets. */
  assetCodes?: string[];
  /** Extra owner-specific fields, rendered in the filter grid. */
  children?: ReactNode;
  /** Extra active filters owned by `children`, added to the clear count. */
  extraActiveCount?: number;
  /** Called by "Clear" in addition to `onChange({})`, to reset `children`. */
  onClearExtras?: () => void;
  className?: string;
}

const STATUS_OPTIONS: { value: ExpenseStatusFilter; label: string; icon: ReactNode }[] = [
  { value: "all", label: "All", icon: <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" /> },
  { value: "pending", label: "Pending", icon: <Clock className="h-3.5 w-3.5" aria-hidden="true" /> },
  { value: "settled", label: "Settled", icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> },
];

const fieldLabel = "mb-1 block font-display text-xs uppercase tracking-widest text-ink";

function countActive(filters: ActivityFilters): number {
  let n = 0;
  if (filters.keyword) n++;
  if (filters.participant) n++;
  if (filters.fromDate) n++;
  if (filters.toDate) n++;
  if (filters.assetCode) n++;
  if (filters.status && filters.status !== "all") n++;
  return n;
}

export function ExpenseFilterBar({
  value,
  onChange,
  label = "Search and filter activity feed",
  searchLabel = "Search activity by memo or participant",
  searchPlaceholder = "Search memo, description, or participant…",
  showParticipant = true,
  showStatus = false,
  assetCodes,
  children,
  extraActiveCount = 0,
  onClearExtras,
  className,
}: ExpenseFilterBarProps) {
  const id = useId();
  const activeCount = countActive(value) + extraActiveCount;

  const set = (patch: Partial<ActivityFilters>) => onChange({ ...value, ...patch });
  const clearAll = () => {
    onChange({});
    onClearExtras?.();
  };

  const codes = assetCodes ?? Array.from(new Set(SETTLEMENT_ASSETS.map((a) => a.code).filter(Boolean)));
  const currentStatus = value.status ?? "all";

  return (
    <div
      role="search"
      aria-label={label}
      className={cn("mb-6 space-y-3 rounded-2xl border-3 border-ink bg-paper p-3 shadow-brutal sm:p-4", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            className="pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
            value={value.keyword ?? ""}
            onChange={(e) => set({ keyword: e.target.value })}
          />
          {value.keyword && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => set({ keyword: undefined })}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink/60 hover:bg-cream hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {activeCount > 0 && (
          <Button variant="outline" size="sm" onClick={clearAll}>
            <FilterX className="h-4 w-4" aria-hidden="true" />
            Clear ({activeCount})
          </Button>
        )}
      </div>

      {showStatus && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Settlement status">
          <span className="font-display text-xs uppercase tracking-widest text-ink/60" aria-hidden="true">
            Status:
          </span>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => set({ status: option.value })}
              aria-pressed={currentStatus === option.value}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-all duration-100",
                currentStatus === option.value
                  ? "border-ink bg-grape text-white shadow-brutal-sm"
                  : "border-ink/20 bg-cream text-ink/70 hover:border-ink hover:text-ink"
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {showParticipant && (
          <div className="min-w-0">
            <label htmlFor={`${id}-participant`} className={fieldLabel}>
              Participant
            </label>
            <Input
              id={`${id}-participant`}
              aria-label="Filter by participant"
              placeholder="Participant name…"
              value={value.participant ?? ""}
              onChange={(e) => set({ participant: e.target.value })}
            />
          </div>
        )}

        <div className="min-w-0">
          <label htmlFor={`${id}-asset`} className={fieldLabel}>
            Currency
          </label>
          <Select
            id={`${id}-asset`}
            aria-label="Filter by currency"
            className={cn(!value.assetCode && "text-ink/40")}
            value={value.assetCode ?? ""}
            onChange={(e) => set({ assetCode: e.target.value })}
          >
            <option value="">All currencies</option>
            {codes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-0">
          <label htmlFor={`${id}-from`} className={fieldLabel}>
            From
          </label>
          <Input
            id={`${id}-from`}
            type="date"
            aria-label="Filter from date"
            max={value.toDate || undefined}
            value={value.fromDate ?? ""}
            onChange={(e) => set({ fromDate: e.target.value })}
          />
        </div>

        <div className="min-w-0">
          <label htmlFor={`${id}-to`} className={fieldLabel}>
            To
          </label>
          <Input
            id={`${id}-to`}
            type="date"
            aria-label="Filter to date"
            min={value.fromDate || undefined}
            value={value.toDate ?? ""}
            onChange={(e) => set({ toDate: e.target.value })}
          />
        </div>

        {children}
      </div>
    </div>
  );
}
