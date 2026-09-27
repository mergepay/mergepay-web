/**
 * Expense search & filter predicates (#356).
 *
 * Pure functions, no React: the filter bar owns only the values, and any list
 * (or a query hook, later) can apply them with `filterExpenses`. Every
 * predicate treats an empty value as "no constraint" so filters compose by
 * simple AND.
 *
 * Dates are compared as local calendar days (`yyyy-MM-dd`) — the same value
 * an `<input type="date">` produces — so "from 1 May to 1 May" includes
 * everything created on 1 May in the reader's timezone.
 */

import { format } from "date-fns";
import { parseApiTimestamp } from "./datetime";
import type { Expense } from "./types";

export type ExpenseStatusFilter = "all" | "settled" | "pending";

export interface ExpenseFilterValues {
  keyword?: string;
  assetCode?: string;
  status?: ExpenseStatusFilter;
  /** Inclusive lower bound, `yyyy-MM-dd`. */
  fromDate?: string;
  /** Inclusive upper bound, `yyyy-MM-dd`. */
  toDate?: string;
}

export const EMPTY_EXPENSE_FILTERS: ExpenseFilterValues = {
  keyword: "",
  assetCode: "",
  status: "all",
  fromDate: "",
  toDate: "",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Settled means every share has been paid; an expense with no shares is pending. */
export function isExpenseSettled(expense: Expense): boolean {
  return expense.shares.length > 0 && expense.shares.every((s) => s.status === "settled");
}

/**
 * Case-insensitive match against title, description, memo, payer and
 * participant names. Multiple words must all match, in any field.
 */
export function matchesKeyword(expense: Expense, keyword: string | undefined): boolean {
  const terms = (keyword ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    expense.title,
    expense.description,
    expense.memo,
    expense.payer?.displayName,
    ...expense.shares.map((s) => s.user?.displayName),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function matchesAsset(expense: Expense, assetCode: string | undefined): boolean {
  if (!assetCode) return true;
  return expense.assetCode.toUpperCase() === assetCode.toUpperCase();
}

export function matchesStatus(expense: Expense, status: ExpenseStatusFilter | undefined): boolean {
  if (!status || status === "all") return true;
  return status === "settled" ? isExpenseSettled(expense) : !isExpenseSettled(expense);
}

/** Local calendar day of an API timestamp, or `null` if it cannot be parsed. */
export function expenseDay(createdAt: string): string | null {
  const parsed = parseApiTimestamp(createdAt);
  return parsed.date ? format(parsed.date, "yyyy-MM-dd") : null;
}

/**
 * Inclusive date-range check. A reversed range is treated as if the bounds
 * were swapped, and malformed bounds are ignored rather than hiding
 * everything.
 */
export function matchesDateRange(
  expense: Expense,
  fromDate: string | undefined,
  toDate: string | undefined
): boolean {
  let from = fromDate && DAY.test(fromDate) ? fromDate : "";
  let to = toDate && DAY.test(toDate) ? toDate : "";
  if (!from && !to) return true;
  if (from && to && from > to) [from, to] = [to, from];
  const day = expenseDay(expense.createdAt);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function matchesExpenseFilters(expense: Expense, filters: ExpenseFilterValues): boolean {
  return (
    matchesKeyword(expense, filters.keyword) &&
    matchesAsset(expense, filters.assetCode) &&
    matchesStatus(expense, filters.status) &&
    matchesDateRange(expense, filters.fromDate, filters.toDate)
  );
}

export function filterExpenses(expenses: Expense[], filters: ExpenseFilterValues): Expense[] {
  if (countActiveExpenseFilters(filters) === 0) return expenses;
  return expenses.filter((e) => matchesExpenseFilters(e, filters));
}

/** Number of constraints in effect — drives the "Clear (n)" control. */
export function countActiveExpenseFilters(filters: ExpenseFilterValues): number {
  let n = 0;
  if (filters.keyword?.trim()) n++;
  if (filters.assetCode) n++;
  if (filters.status && filters.status !== "all") n++;
  if (filters.fromDate) n++;
  if (filters.toDate) n++;
  return n;
}
