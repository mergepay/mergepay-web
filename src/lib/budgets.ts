import { amountToStroops, currencyRate } from "./currency";
import type { SupportedFiatCurrency } from "./currency";

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

// ---------------------------------------------------------------------------
// Group budget tracker (#248)
// ---------------------------------------------------------------------------

/** Thresholds that trigger a warning toast when crossed. */
export type BudgetThreshold = "80" | "100";

/**
 * Indicative XLM → USD rate used only to render the budget comparison when
 * no live rate service is available. Deliberately overridable (see
 * {@link groupBudgetPercent}) and never treated as a settlement quote — the
 * same spirit as `FALLBACK_USD_RATES` in `src/lib/currency.ts`.
 */
export const INDICATIVE_XLM_USD = 0.5;

/**
 * Approximate USD value of one unit of a settlement asset. USDC is pegged
 * 1:1; XLM uses {@link INDICATIVE_XLM_USD}; anything else is treated as 1.
 */
export function assetToUsd(
  assetCode: string | null | undefined,
  xlmUsdRate: number = INDICATIVE_XLM_USD
): number {
  const code = assetCode?.toUpperCase();
  if (code === "USDC" || code === "USD") return 1;
  if (code === "XLM") return xlmUsdRate;
  return 1;
}

/**
 * Convert a fiat value in USD to the target currency using the same
 * indicative fiat rates as the expense form's currency converter.
 * `currencyRate` returns currency→USD, so USD→currency is the inverse.
 */
export function usdToCurrency(
  usdValue: number,
  currency: SupportedFiatCurrency
): number {
  const rate = currencyRate(currency);
  if (!Number.isFinite(rate) || rate <= 0) return usdValue;
  return usdValue / rate;
}

/**
 * Exact total spending across expenses, in stroops. Unparseable amounts are
 * skipped so one bad row can't zero out (or inflate) the whole budget.
 */
export function groupBudgetSpentStroops(
  expenses: BudgetExpense[]
): bigint {
  return expenses.reduce((total, expense) => {
    const stroops = amountToStroops(expense.amount);
    return stroops !== null && stroops > 0n ? total + stroops : total;
  }, 0n);
}

/**
 * The group's spending expressed in the budget's target currency.
 * Returns `null` when no spending is recorded.
 */
export function spentInBudgetCurrency(args: {
  expenses: BudgetExpense[];
  assetCode: string | null | undefined;
  currency: SupportedFiatCurrency;
  xlmUsdRate?: number;
}): number | null {
  const { expenses, assetCode, currency } = args;
  const stroops = groupBudgetSpentStroops(expenses);
  if (stroops <= 0n) return null;
  const units = Number(stroops) / 10_000_000;
  const usd = units * assetToUsd(assetCode, args.xlmUsdRate);
  return usdToCurrency(usd, currency);
}

/**
 * Percent of the budget consumed, or 0 when the budget is unconfigured or
 * zero (safe division). Spending over the budget yields > 100.
 */
export function groupBudgetPercent(args: {
  expenses: BudgetExpense[];
  assetCode: string | null | undefined;
  limit: number;
  currency: SupportedFiatCurrency;
  xlmUsdRate?: number;
}): number {
  if (!Number.isFinite(args.limit) || args.limit <= 0) return 0;
  const spent = spentInBudgetCurrency(args);
  if (spent === null) return 0;
  return Math.max(0, (spent / args.limit) * 100);
}

/**
 * Color for the progress bar: lime under 80%, butter at 80–99%, flamingo at
 * 100% and over.
 */
export function budgetTone(percent: number): "lime" | "butter" | "flamingo" {
  if (percent >= 100) return "flamingo";
  if (percent >= 80) return "butter";
  return "lime";
}

/**
 * Thresholds crossed when moving from `prevPercent` to `nextPercent`, in
 * ascending order. Only upward crossings count: settling expenses back under
 * a threshold never re-triggers the toast until the budget is edited.
 */
export function crossedBudgetThresholds(
  prevPercent: number,
  nextPercent: number
): BudgetThreshold[] {
  const crossed: BudgetThreshold[] = [];
  if (prevPercent < 80 && nextPercent >= 80) crossed.push("80");
  if (prevPercent < 100 && nextPercent >= 100) crossed.push("100");
  return crossed;
}
