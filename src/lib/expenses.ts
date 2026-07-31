import { z } from "zod";
import { API_URL } from "./constants";
import type { Expense, Settlement } from "./types";

const expensesPaginationSchema = z.object({
  groupId: z.string().min(1, "groupId is required"),
  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(100, "limit must be at most 100")
    .default(20),
  cursor: z.string().min(1).optional(),
});

export type ExpensesPaginationParams = z.infer<typeof expensesPaginationSchema>;

export interface PaginatedResponse<T> {
  /** Page of items. Named `data` to match the spec in issue #23. */
  data: T[];
  /** Opaque base64url token to fetch the next page. `null` on the last page. */
  nextCursor: string | null;
}

export type ExpensesPage = PaginatedResponse<Expense>;

/**
 * Cursor payload encoded into the opaque `cursor` query parameter.
 * The base64url wrapper keeps it transport-tolerant without exposing
 * internal ids / timestamps to API consumers.
 */
export interface ExpenseCursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: ExpenseCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Returns `null` for any malformed cursor so callers can return 400
 * instead of leaking internal schema details on a parse failure.
 */
export function decodeCursor(cursor: string): ExpenseCursorPayload | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ExpenseCursorPayload).createdAt === "string" &&
      typeof (parsed as ExpenseCursorPayload).id === "string"
    ) {
      return parsed as ExpenseCursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate `URLSearchParams` for the GET /api/expenses endpoint and
 * return parsed, typed values. Throws `ZodError` on bad input.
 */
export function parseExpensesQuery(
  searchParams: URLSearchParams
): ExpensesPaginationParams {
  const raw: Record<string, unknown> = {
    groupId: searchParams.get("groupId"),
  };
  const limit = searchParams.get("limit");
  if (limit !== null) raw.limit = limit;
  const cursor = searchParams.get("cursor");
  if (cursor !== null) raw.cursor = cursor;
  return expensesPaginationSchema.parse(raw);
}

/**
 * Fetch one page of expenses from the upstream API. The upstream is
 * expected to support `limit` and `cursor` query parameters; we forward
 * both transparently. If the upstream returns the legacy
 * `expenses` array shape instead of `items`, that shape is accepted so
 * the endpoint stays compatible while the upstream rolls out.
 */
export async function fetchExpensesPage(
  groupId: string,
  token: string | null,
  params: { limit: number; cursor?: string },
  upstreamUrl: string = API_URL,
  fetchImpl: typeof fetch = fetch
): Promise<ExpensesPage> {
  const url = new URL(`/groups/${groupId}/expenses`, upstreamUrl);
  url.searchParams.set("limit", String(params.limit));
  if (params.cursor) url.searchParams.set("cursor", params.cursor);

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetchImpl(url.toString(), { headers });
  if (!res.ok) {
    throw Object.assign(new Error(`Upstream ${res.status}`), {
      upstreamStatus: res.status,
    });
  }
  // Upstream contract (see `ExpensesResponse` in types.ts): the body
  // is `{ expenses: Expense[] }`. We extract that and emit the
  // canonical `{ data, nextCursor }` envelope.
  const payload = (await res.json()) as {
    expenses?: Expense[];
    nextCursor?: string | null;
  };
  const data: Expense[] = Array.isArray(payload.expenses)
    ? (payload.expenses as Expense[])
    : [];
  const nextCursor =
    typeof payload.nextCursor === "string" && payload.nextCursor.length > 0
      ? payload.nextCursor
      : null;
  return { data, nextCursor };
}

/**
 * Pure client-side sort that orders an expense list newest-first by
 * `createdAt`. Pairs with `fetchExpensesPage` (issue #23) so the same
 * ordering is always shown regardless of cursor walks.
 *
 * Returns a new array; the input is not mutated.
 */
export function sortExpensesByDateDesc(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
}

// ---------------------------------------------------------------------------
// History pagination helpers
// ---------------------------------------------------------------------------

/**
 * Accumulated history across all loaded pages.
 * Both arrays are kept in stable newest-first order regardless of the
 * order pages arrive in, so the UI never shows re-ordered entries on
 * re-render.
 */
export interface AccumulatedHistory {
  expenses: Expense[];
  settlements: Settlement[];
}

/**
 * Merge a new page of history into the accumulated set, deduplicating
 * by `id` so repeated records from overlapping page responses never
 * appear twice.
 *
 * The returned arrays are sorted newest-first by `createdAt` (stable
 * sort — equal timestamps keep their original relative order).
 */
export function mergeHistoryPages(
  acc: AccumulatedHistory,
  page: { expenses: Expense[]; settlements: Settlement[] }
): AccumulatedHistory {
  const seenExpenses = new Set(acc.expenses.map((e) => e.id));
  const seenSettlements = new Set(acc.settlements.map((s) => s.id));

  const newExpenses = page.expenses.filter((e) => !seenExpenses.has(e.id));
  const newSettlements = page.settlements.filter(
    (s) => !seenSettlements.has(s.id)
  );

  const mergedExpenses = sortExpensesByDateDesc([
    ...acc.expenses,
    ...newExpenses,
  ]);

  const mergedSettlements = [...acc.settlements, ...newSettlements].sort(
    (a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    }
  );

  return { expenses: mergedExpenses, settlements: mergedSettlements };
}

/**
 * Flatten the pages held by an infinite query into the list to render.
 *
 * Cursor pages can overlap: a refetch re-issues page 1 while later pages
 * are still cached, and an expense created between two fetches shifts the
 * window. The expense id is the stable merge key — the first occurrence
 * wins, so a record already on screen keeps its identity (and its React
 * key) instead of being duplicated.
 *
 * The result is sorted newest-first so a late page cannot interleave out
 * of order.
 */
export function mergeExpensePages(
  pages: readonly ExpensesPage[] | undefined
): Expense[] {
  if (!pages || pages.length === 0) return [];

  const seen = new Set<string>();
  const merged: Expense[] = [];
  for (const page of pages) {
    for (const expense of page.data ?? []) {
      if (seen.has(expense.id)) continue;
      seen.add(expense.id);
      merged.push(expense);
    }
  }
  return sortExpensesByDateDesc(merged);
}

/**
 * Whether the API reported another page after the ones already loaded.
 * A `null` (or missing) `nextCursor` on the last page is the end of the
 * list — that is the only signal we stop on, never a short page.
 */
export function hasMoreExpensePages(
  pages: readonly ExpensesPage[] | undefined
): boolean {
  if (!pages || pages.length === 0) return false;
  const last = pages[pages.length - 1];
  return typeof last.nextCursor === "string" && last.nextCursor.length > 0;
}
