/**
 * Search and filtering for a group's activity feed (#815).
 *
 * Pure predicates over `GroupActivityEvent`, kept out of the component so the
 * matching rules are unit-tested and the feed only memoizes
 * `filterActivityEvents(events, filters)`. Filter state round-trips through
 * URL search params, so a filtered view can be shared as a link.
 */

import type { GroupActivityEvent, GroupActivityType } from "./types";

export const ACTIVITY_TYPES: readonly GroupActivityType[] = [
  "expense_created",
  "payment_settled",
  "member_joined",
  "expense_deleted",
] as const;

export const ACTIVITY_TYPE_LABELS: Record<GroupActivityType, string> = {
  expense_created: "Expenses",
  payment_settled: "Settlements",
  member_joined: "Members",
  expense_deleted: "Deletions",
};

export interface ActivityFeedFilters {
  /** Free text: description, member names, memo and amount. */
  keyword?: string;
  /** Member name: the actor, or a named counterparty in the event's metadata. */
  participant?: string;
  /** Memo tag, e.g. `MP:dinner` or just `dinner`. Case-insensitive substring. */
  memo?: string;
  /** Asset code. Events with no asset (e.g. a member joining) never match one. */
  assetCode?: string;
  /** Inclusive `YYYY-MM-DD` bounds, in the viewer's local day. */
  fromDate?: string;
  toDate?: string;
  /** Event kinds to keep. Empty or absent keeps every kind. */
  types?: GroupActivityType[];
}

const norm = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const metaString = (meta: Record<string, unknown> | undefined, key: string): string | null => {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
};

/**
 * The memo an event carries: the top-level field the API sends, or the
 * `metadata.memo` older payloads used.
 */
export function activityMemo(event: GroupActivityEvent): string | null {
  return (event.memo && event.memo.trim()) || metaString(event.metadata, "memo");
}

/**
 * Every member name an event mentions: the actor plus any counterparty the
 * API names in metadata (`counterpartyName`, `toDisplayName`, `participants`).
 */
export function activityMemberNames(event: GroupActivityEvent): string[] {
  const names = [event.actor.displayName];
  for (const key of ["counterpartyName", "toDisplayName", "fromDisplayName", "payerName"]) {
    const name = metaString(event.metadata, key);
    if (name) names.push(name);
  }
  const participants = event.metadata?.participants;
  if (Array.isArray(participants)) {
    for (const p of participants) {
      if (typeof p === "string") names.push(p);
      else if (p && typeof p === "object" && typeof (p as { displayName?: unknown }).displayName === "string") {
        names.push((p as { displayName: string }).displayName);
      }
    }
  }
  return names;
}

/** Local-midnight epoch ms for a `YYYY-MM-DD` string, or null when invalid. */
function localDayStart(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether one event passes every active filter. */
export function matchesActivityFilters(
  event: GroupActivityEvent,
  filters: ActivityFeedFilters
): boolean {
  if (filters.types && filters.types.length > 0 && !filters.types.includes(event.type)) {
    return false;
  }

  const keyword = norm(filters.keyword);
  if (keyword) {
    const haystack = [
      event.description,
      activityMemo(event) ?? "",
      event.amount ?? "",
      event.assetCode ?? "",
      ...activityMemberNames(event),
    ]
      .join("\n")
      .toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }

  const participant = norm(filters.participant);
  if (participant && !activityMemberNames(event).some((name) => norm(name).includes(participant))) {
    return false;
  }

  const memo = norm(filters.memo);
  if (memo) {
    const eventMemo = norm(activityMemo(event));
    if (!eventMemo || !eventMemo.includes(memo)) return false;
  }

  if (filters.assetCode && event.assetCode !== filters.assetCode) return false;

  const from = localDayStart(filters.fromDate);
  const to = localDayStart(filters.toDate);
  if (from !== null || to !== null) {
    const at = new Date(event.timestamp).getTime();
    if (Number.isNaN(at)) return false;
    if (from !== null && at < from) return false;
    // `to` is inclusive of the whole day.
    if (to !== null && at >= to + DAY_MS) return false;
  }

  return true;
}

/** The events that pass `filters`, in their original order. */
export function filterActivityEvents(
  events: readonly GroupActivityEvent[],
  filters: ActivityFeedFilters
): GroupActivityEvent[] {
  if (countActiveActivityFilters(filters) === 0) return [...events];
  return events.filter((event) => matchesActivityFilters(event, filters));
}

/** How many filters are narrowing the feed (for the "Clear (n)" control). */
export function countActiveActivityFilters(filters: ActivityFeedFilters): number {
  let n = 0;
  if (norm(filters.keyword)) n++;
  if (norm(filters.participant)) n++;
  if (norm(filters.memo)) n++;
  if (filters.assetCode) n++;
  if (filters.fromDate) n++;
  if (filters.toDate) n++;
  if (filters.types && filters.types.length > 0) n++;
  return n;
}

const PARAM = {
  keyword: "q",
  participant: "participant",
  memo: "memo",
  assetCode: "asset",
  fromDate: "from",
  toDate: "to",
  types: "type",
} as const;

const isActivityType = (value: string): value is GroupActivityType =>
  (ACTIVITY_TYPES as readonly string[]).includes(value);

/** Read filters from URL search params, dropping unknown event types. */
export function activityFiltersFromSearchParams(
  params: Pick<URLSearchParams, "get">
): ActivityFeedFilters {
  const read = (key: string) => params.get(key)?.trim() || undefined;
  const types = (params.get(PARAM.types) ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(isActivityType);
  return {
    keyword: read(PARAM.keyword),
    participant: read(PARAM.participant),
    memo: read(PARAM.memo),
    assetCode: read(PARAM.assetCode),
    fromDate: read(PARAM.fromDate),
    toDate: read(PARAM.toDate),
    types: types.length > 0 ? types : undefined,
  };
}

/**
 * Write filters into `base` (other params are kept), removing any that are
 * empty, and return the resulting query string without a leading `?`.
 */
export function activityFiltersToSearchParams(
  filters: ActivityFeedFilters,
  base: string | URLSearchParams = ""
): string {
  const params = new URLSearchParams(base);
  const set = (key: string, value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) params.set(key, trimmed);
    else params.delete(key);
  };
  set(PARAM.keyword, filters.keyword);
  set(PARAM.participant, filters.participant);
  set(PARAM.memo, filters.memo);
  set(PARAM.assetCode, filters.assetCode);
  set(PARAM.fromDate, filters.fromDate);
  set(PARAM.toDate, filters.toDate);
  set(PARAM.types, filters.types && filters.types.length > 0 ? filters.types.join(",") : undefined);
  return params.toString();
}
