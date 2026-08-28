export const BUDGET_CATEGORIES = ["Rent", "Food", "Event", "Travel"] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];
export type BudgetLimits = Partial<Record<BudgetCategory, number>>;
export type BudgetExpense = { category?: string | null; amount: string | number; settled?: boolean };

export function budgetUsage(expenses: BudgetExpense[]): Record<BudgetCategory, number> {
  return expenses.reduce((totals, expense) => {
    const category = BUDGET_CATEGORIES.find((value) => value.toLowerCase() === expense.category?.toLowerCase());
    const amount = Number(expense.amount);
    if (category && !expense.settled && Number.isFinite(amount) && amount > 0) totals[category] += amount;
    return totals;
  }, Object.fromEntries(BUDGET_CATEGORIES.map((category) => [category, 0])) as Record<BudgetCategory, number>);
}

export function budgetPercent(used: number, limit: number | undefined): number {
  if (!limit || limit <= 0) return 0;
  return Math.max(0, used / limit * 100);
}
