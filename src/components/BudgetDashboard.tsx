"use client";

import { useMemo } from "react";
import { BUDGET_CATEGORIES, budgetPercent, budgetUsage, type BudgetExpense, type BudgetLimits, type BudgetCategory } from "@/lib/budgets";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function BudgetDashboard({ expenses, limits, onCategoryClick }: { expenses: BudgetExpense[]; limits: BudgetLimits; onCategoryClick?: (category: BudgetCategory) => void }) {
  const usage = useMemo(() => budgetUsage(expenses), [expenses]);
  return <section aria-labelledby="budget-title" className="rounded-xl border-2 border-ink bg-cream p-4 shadow-brutal">
    <h2 id="budget-title" className="font-display text-lg font-bold uppercase">Budget tracking</h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {BUDGET_CATEGORIES.map((category) => {
        const limit = limits[category] ?? 0; const used = usage[category]; const percent = budgetPercent(used, limit);
        return <button type="button" key={category} onClick={() => onCategoryClick?.(category)} className="rounded-lg border-2 border-ink bg-paper p-3 text-left hover:bg-butter" aria-label={`Filter expenses by ${category}`}>
          <div className="flex justify-between text-sm font-bold"><span>{category}</span><span>{used.toFixed(2)} / {limit.toFixed(2)}</span></div>
          <div className="mt-2"><ProgressBar value={percent} label={`${category} budget ${Math.round(percent)} percent used`} /></div>
        </button>;
      })}
    </div>
  </section>;
}
