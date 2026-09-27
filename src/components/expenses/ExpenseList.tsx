"use client";

/**
 * Searchable, filterable expense list (#356).
 *
 * Filter state can be owned by the caller (`filters` + `onFiltersChange`, e.g.
 * to mirror it into the URL or a query hook) or left to the list itself.
 * Either way the matching is done by the pure predicates in
 * `src/lib/expenseFilters.ts`, and a filter that matches nothing renders an
 * explicit empty state with a way back.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Receipt, SearchX } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/button";
import { Money } from "../amount";
import { ExpenseFilterBar, type ActivityFilters } from "./ExpenseFilterBar";
import { countActiveExpenseFilters, filterExpenses, type ExpenseFilterValues } from "@/lib/expenseFilters";
import { formatTimestamp } from "@/lib/datetime";
import type { Expense } from "@/lib/types";

export interface ExpenseListProps {
  expenses: Expense[];
  className?: string;
  /** Controlled filter values. Omit to let the list manage its own. */
  filters?: ExpenseFilterValues;
  onFiltersChange?: (next: ExpenseFilterValues) => void;
  /** Hide the built-in bar, e.g. when the owner renders it elsewhere. */
  hideFilterBar?: boolean;
  /** Custom row renderer; defaults to a compact card. */
  renderExpense?: (expense: Expense) => ReactNode;
}

function DefaultExpenseRow({ expense }: { expense: Expense }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{expense.title}</p>
          <p className="text-xs text-ink/60">{formatTimestamp(expense.createdAt)}</p>
        </div>
        <div className="shrink-0 text-right font-mono font-bold">
          <Money value={expense.amount} assetCode={expense.assetCode} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ExpenseList({
  expenses,
  className = "",
  filters: controlledFilters,
  onFiltersChange,
  hideFilterBar = false,
  renderExpense,
}: ExpenseListProps) {
  const [ownFilters, setOwnFilters] = useState<ExpenseFilterValues>({});
  const filters = controlledFilters ?? ownFilters;
  const setFilters = (next: ExpenseFilterValues) => {
    if (controlledFilters === undefined) setOwnFilters(next);
    onFiltersChange?.(next);
  };

  const all = useMemo(() => expenses ?? [], [expenses]);
  const visible = useMemo(() => filterExpenses(all, filters), [all, filters]);
  const assetCodes = useMemo(() => [...new Set(all.map((e) => e.assetCode))].sort(), [all]);
  const filtering = countActiveExpenseFilters(filters) > 0;

  if (all.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<Receipt className="h-7 w-7" aria-hidden="true" />}
        title="No expenses yet"
        description="Expenses added to this group will show up here."
      />
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {!hideFilterBar && (
        <ExpenseFilterBar
          value={filters as ActivityFilters}
          onChange={(next) => setFilters(next)}
          label="Search and filter expenses"
          searchLabel="Search expenses"
          searchPlaceholder="Search title, memo, or person…"
          showParticipant={false}
          showStatus
          assetCodes={assetCodes}
          className="mb-4"
        />
      )}

      {filtering && (
        <p className="text-xs font-bold text-ink/60" role="status" aria-live="polite">
          Showing {visible.length} of {all.length} expense{all.length === 1 ? "" : "s"}
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-7 w-7" aria-hidden="true" />}
          title="No matching expenses"
          description="Nothing matches these filters. Try a different keyword, currency, status, or date range."
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters({})}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((expense) => (
            <li key={expense.id}>{renderExpense ? renderExpense(expense) : <DefaultExpenseRow expense={expense} />}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
