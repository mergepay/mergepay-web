import { z } from "zod";
import { API_URL } from "./constants";
import type { Expense } from "./types";

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
