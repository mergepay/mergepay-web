"use client";

import { Search, X, FilterX, CheckCircle2, Clock, CircleDollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SettlementStatus = "all" | "settled" | "pending";

export interface ExpenseFilters {
  keyword?: string;
  status?: SettlementStatus;
}

export interface ExpenseFilterToolbarProps {
  value: ExpenseFilters;
  onChange: (next: ExpenseFilters) => void;
  className?: string;
}

const STATUS_OPTIONS: { value: SettlementStatus; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All", icon: <CircleDollarSign className="h-3.5 w-3.5" /> },
  { value: "settled", label: "Settled", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { value: "pending", label: "Pending", icon: <Clock className="h-3.5 w-3.5" /> },
];

function countActive(filters: ExpenseFilters): number {
  let n = 0;
  if (filters.keyword) n++;
  if (filters.status && filters.status !== "all") n++;
  return n;
}

export function ExpenseFilterToolbar({ value, onChange, className }: ExpenseFilterToolbarProps) {
  const activeCount = countActive(value);

  const setKeyword = (keyword: string) => onChange({ ...value, keyword });
  const setStatus = (status: SettlementStatus) => onChange({ ...value, status });
  const clearAll = () => onChange({});
  const clearKeyword = () => onChange({ ...value, keyword: undefined });

  const hasFilters = activeCount > 0;
  const currentStatus = value.status ?? "all";

  return (
    <div
      role="search"
      aria-label="Search and filter expenses"
      className={cn(
        "mb-6 space-y-3 rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50"
            aria-hidden="true"
          />
          <Input
            aria-label="Search expenses by description or participant"
            placeholder="Search expenses..."
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-xs uppercase tracking-widest text-ink/60">
          Status:
        </span>
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatus(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-display uppercase tracking-wider transition-all duration-100",
              currentStatus === option.value
                ? "border-ink bg-grape text-white shadow-brutal-sm font-bold"
                : "border-transparent text-ink/60 hover:border-ink hover:bg-cream hover:text-ink"
            )}
            aria-pressed={currentStatus === option.value}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
