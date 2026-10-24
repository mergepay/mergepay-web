/**
 * Client-side filtering for the transaction history view (issue #394).
 *
 * The accumulated history (expenses + settlements) is filtered entirely in
 * the browser so results update instantly as the user types or adjusts a
 * filter. No source array is ever mutated — every filter helper returns a
 * fresh array.
 */
import type { Expense, Settlement } from "./types";
import { isExpenseSettled } from "./expenseFilters";

/** A search/filter predicate applied to one history item. */
export interface HistoryFilters {
  /** Free-text keyword matched against titles, memos and participant names. */
  keyword?: string;
  /** Narrow to a single settlement asset code (e.g. "XLM", "USDC"). */
  assetCode?: string;
  /** Filter by settlement or expense status (e.g. "pending", "settled", "failed"). */
  status?: string;
  /** Only show records where this participant (name) took part. */
  participant?: string;
  /** Only show records on or after this date (ISO, inclusive). */
  fromDate?: string;
  /** Only show records on or before this date (ISO, inclusive). */
  toDate?: string;
  /** "all" | "expenses" | "settlements" — the source kind to show. */
  kind?: "all" | "expenses" | "settlements";
}

/** A row normalized for filtering regardless of whether it's an expense or settlement. */
export interface HistoryRow {
  type: "expense" | "settlement";
  id: string;
  createdAt: string;
  assetCode: string;
  status: string;
  /** Free-text haystack: title, memo and every participant's display name. */
  searchText: string;
  /** Every display name involved in the record (payer, payee, members). */
  participants: string[];
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Build a normalized filter row from the source record. Keeping this mapping
 * in one place means the filter logic stays agnostic to the underlying shape.
 */
export function toHistoryRow(item: { type: "expense" | "settlement" } & (
  | Expense
  | Settlement
)): HistoryRow {
  if (item.type === "expense") {
    const expense = item as Expense;
    return {
      type: "expense",
      id: expense.id,
      createdAt: expense.createdAt,
      assetCode: expense.assetCode ?? "",
      status: isExpenseSettled(expense) ? "settled" : "pending",
      searchText: [
        expense.title,
        expense.description,
        expense.memo,
        expense.payer?.displayName,
        ...(expense.shares ?? []).map((s) => s.user?.displayName),
      ]
        .filter(Boolean)
        .join(" "),
      participants: [
        expense.payer?.displayName,
        ...(expense.shares ?? []).map((s) => s.user?.displayName),
      ]
        .filter((p): p is string => Boolean(p)),
    };
  }
  const settlement = item as Settlement;
  return {
    type: "settlement",
    id: settlement.id,
    createdAt: settlement.createdAt,
    assetCode: settlement.assetCode ?? "",
    status: settlement.status ?? "pending",
    searchText: [
      settlement.memo,
      settlement.from?.displayName,
      settlement.to?.displayName,
    ]
      .filter(Boolean)
      .join(" "),
    participants: [
      settlement.from?.displayName,
      settlement.to?.displayName,
    ].filter((p): p is string => Boolean(p)),
  };
}

/** True when the row matches every active filter. */
export function matchesHistoryFilters(
  row: HistoryRow,
  filters: HistoryFilters
): boolean {
  if (filters.kind && filters.kind !== "all") {
    // Filters use plural labels ("expenses"/"settlements") while rows carry
    // singular kinds ("expense"/"settlement") — translate for the comparison.
    const kindType =
      filters.kind === "expenses" ? "expense" : "settlement";
    if (kindType !== row.type) return false;
  }
  if (filters.assetCode && filters.assetCode !== "all") {
    const code = normalize(filters.assetCode);
    if (code && normalize(row.assetCode) !== code) return false;
  }
  if (filters.status && filters.status !== "all") {
    const statusFilter = normalize(filters.status);
    const rowStatus = normalize(row.status);
    if (statusFilter === "pending") {
      if (!["pending", "submitted", "settling"].includes(rowStatus)) return false;
    } else if (statusFilter === "settled" || statusFilter === "confirmed") {
      if (!["settled", "confirmed"].includes(rowStatus)) return false;
    } else if (statusFilter) {
      if (rowStatus !== statusFilter) return false;
    }
  }
  if (filters.participant) {
    const name = normalize(filters.participant);
    if (
      name &&
      !row.participants.some((p) => normalize(p).includes(name))
    ) {
      return false;
    }
  }
  if (filters.keyword) {
    const kw = normalize(filters.keyword);
    if (kw && !normalize(row.searchText).includes(kw)) return false;
  }
  if (filters.fromDate) {
    const from = new Date(filters.fromDate).getTime();
    if (
      !Number.isNaN(from) &&
      new Date(row.createdAt).getTime() < from
    ) {
      return false;
    }
  }
  if (filters.toDate) {
    // End of the day for the selection so an inclusive "to" date keeps all
    // records from that day.
    const to = new Date(`${filters.toDate}T23:59:59.999`).getTime();
    if (!Number.isNaN(to) && new Date(row.createdAt).getTime() > to) {
      return false;
    }
  }
  return true;
}

/** True when no active filters are set (used to skip work and show "All"). */
export function hasActiveFilters(filters: HistoryFilters): boolean {
  return Boolean(
    filters.keyword ||
      (filters.assetCode && filters.assetCode !== "all") ||
      (filters.status && filters.status !== "all") ||
      filters.participant ||
      filters.fromDate ||
      filters.toDate ||
      (filters.kind && filters.kind !== "all")
  );
}

/**
 * Apply filters to a list of rows, preserving input order. Pure: never
 * mutates the caller's array.
 */
export function filterHistoryRows(
  rows: HistoryRow[],
  filters: HistoryFilters
): HistoryRow[] {
  return rows.filter((row) => matchesHistoryFilters(row, filters));
}

/** Chronological ordering for history items (issue #314). */
export type HistorySortOrder = "newest" | "oldest";

/**
 * Sortable history item shape. Accepts the history page's wrapper records
 * (`date`) as well as raw Expense/Settlement records (`createdAt`); items
 * with neither (or an unparseable date) sort as epoch (oldest).
 */
export interface HistorySortableItem {
  date?: string;
  createdAt?: string;
}

/**
 * Sort history items by date. Pure: returns a fresh array and never mutates
 * the caller's list. Ties keep their original input order (stable sort) in
 * both directions, so repeated renders don't reshuffle equal timestamps.
 */
export function sortHistoryRows<T extends HistorySortableItem>(
  items: T[],
  order: HistorySortOrder = "newest"
): T[] {
  const toTime = (item: T): number => {
    const t = new Date(item.date ?? item.createdAt ?? "").getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const direction = order === "newest" ? -1 : 1;
  return [...items].sort(
    (a, b) => direction * (toTime(a) - toTime(b))
  );
}