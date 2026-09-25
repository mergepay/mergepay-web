/**
 * Client-side filtering for the transaction history view (issue #394).
 *
 * The accumulated history (expenses + settlements) is filtered entirely in
 * the browser so results update instantly as the user types or adjusts a
 * filter. No source array is ever mutated — every filter helper returns a
 * fresh array.
 */
import type { Expense, Settlement } from "./types";

/** A search/filter predicate applied to one history item. */
export interface HistoryFilters {
  /** Free-text keyword matched against titles, memos and participant names. */
  keyword?: string;
  /** Narrow to a single settlement asset code (e.g. "XLM", "USDC"). */
  assetCode?: string;
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
    return {
      type: "expense",
      id: (item as Expense).id,
      createdAt: (item as Expense).createdAt,
      assetCode: (item as Expense).assetCode ?? "",
      searchText: [
        (item as Expense).title,
        (item as Expense).description,
        (item as Expense).memo,
        (item as Expense).payer?.displayName,
        ...((item as Expense).shares ?? []).map((s) => s.user?.displayName),
      ]
        .filter(Boolean)
        .join(" "),
      participants: [
        (item as Expense).payer?.displayName,
        ...((item as Expense).shares ?? []).map((s) => s.user?.displayName),
      ]
        .filter((p): p is string => Boolean(p)),
    };
  }
  return {
    type: "settlement",
    id: (item as Settlement).id,
    createdAt: (item as Settlement).createdAt,
    assetCode: (item as Settlement).assetCode ?? "",
    searchText: [
      (item as Settlement).memo,
      (item as Settlement).from?.displayName,
      (item as Settlement).to?.displayName,
    ]
      .filter(Boolean)
      .join(" "),
    participants: [
      (item as Settlement).from?.displayName,
      (item as Settlement).to?.displayName,
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
  if (filters.assetCode) {
    const code = normalize(filters.assetCode);
    if (code && normalize(row.assetCode) !== code) return false;
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
      filters.assetCode ||
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