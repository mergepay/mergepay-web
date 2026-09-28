/**
 * Persisted view state for the transaction history screen (#494).
 *
 * The tab (all / expenses / settlements) and the search-bar filters are
 * display preferences: losing them on every navigation or reload is the
 * behaviour this module exists to prevent. Values are only ever read after
 * mount, so the server render and the first client render agree and no
 * hydration mismatch is produced.
 */

import type { HistoryFilters } from "./historyFilter";

export type HistoryKind = "all" | "expenses" | "settlements";

export interface HistoryView {
  kind: HistoryKind;
  filters: HistoryFilters;
}

const STORAGE_KEY = "mergepay.historyView";

const KINDS: readonly HistoryKind[] = ["all", "expenses", "settlements"];

export const DEFAULT_HISTORY_VIEW: HistoryView = {
  kind: "all",
  filters: { kind: "all" },
};

function isKind(value: unknown): value is HistoryKind {
  return KINDS.includes(value as HistoryKind);
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

/**
 * A persisted filter bag is only trusted when every field it carries is of the
 * shape the filter helpers expect — a hand-edited or stale payload must not
 * reach `matchesHistoryFilters`.
 */
function sanitiseFilters(value: unknown): HistoryFilters {
  if (typeof value !== "object" || value === null) {
    return { kind: "all" };
  }
  const raw = value as Record<string, unknown>;
  const kind = isKind(raw.kind) ? raw.kind : "all";
  return {
    kind,
    keyword: isOptionalText(raw.keyword) ? (raw.keyword as string) : undefined,
    assetCode: isOptionalText(raw.assetCode)
      ? (raw.assetCode as string)
      : undefined,
    participant: isOptionalText(raw.participant)
      ? (raw.participant as string)
      : undefined,
    fromDate: isOptionalText(raw.fromDate)
      ? (raw.fromDate as string)
      : undefined,
    toDate: isOptionalText(raw.toDate) ? (raw.toDate as string) : undefined,
  };
}

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Defaults whenever storage is missing, blocked, empty or corrupt. */
export function readHistoryView(): HistoryView {
  const storage = safeStorage();
  if (!storage) return DEFAULT_HISTORY_VIEW;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HISTORY_VIEW;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_HISTORY_VIEW;
    }
    const { kind, filters } = parsed as { kind?: unknown; filters?: unknown };
    return {
      kind: isKind(kind) ? kind : DEFAULT_HISTORY_VIEW.kind,
      filters: sanitiseFilters(filters),
    };
  } catch {
    return DEFAULT_HISTORY_VIEW;
  }
}

/** Never throws: a full or disabled quota must not break the history view. */
export function writeHistoryView(view: HistoryView): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Storage is unavailable or full — the view simply won't be remembered.
  }
}
