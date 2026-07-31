/**
 * Query lifecycle → render state.
 *
 * Dashboards collapse "no data yet", "nothing to show", and "the request
 * failed" into the same render path far too easily, which is how a failed
 * balances call ends up displaying a confident 0. This module keeps those
 * cases apart as a plain function of a React Query result, so each one can be
 * rendered — and tested — on its own.
 */

export type QueryViewState =
  /** The query has not been enabled yet (e.g. no session). */
  | "idle"
  /** First load: nothing has ever resolved. */
  | "initial-loading"
  /** Failed with nothing to fall back on. */
  | "error"
  /** Failed, but previously loaded data is still worth showing. */
  | "stale-error"
  /** Data on screen while a fetch runs in the background. */
  | "refetching"
  /** Loaded successfully and there is nothing in it. */
  | "empty"
  /** Loaded successfully with content. */
  | "ready";

export interface QuerySnapshot {
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  /** Whether any data is currently held, including from a previous key. */
  hasData: boolean;
  /** Whether the held data contains zero rows. */
  isEmpty: boolean;
  /** Data is a placeholder for a key that is still loading. */
  isPlaceholder?: boolean;
  /** `false` when the query is switched off, e.g. while logged out. */
  enabled?: boolean;
}

/** Map a query result onto the single state the UI should render. */
export function resolveQueryView(snapshot: QuerySnapshot): QueryViewState {
  if (snapshot.enabled === false) return "idle";

  if (snapshot.status === "error") {
    // Keep showing what we had; the retry control sits alongside it.
    return snapshot.hasData ? "stale-error" : "error";
  }

  // React Query reports `pending` only while no data has ever resolved, so a
  // key change lands here rather than momentarily looking empty.
  if (snapshot.status === "pending") {
    return snapshot.hasData ? "refetching" : "initial-loading";
  }

  if (snapshot.isPlaceholder) return "refetching";
  if (snapshot.fetchStatus === "fetching") return "refetching";
  return snapshot.isEmpty ? "empty" : "ready";
}

/**
 * Is there real data behind this state?
 *
 * Totals, balances, and counts must only render when this is true — otherwise
 * a loading or failed request reads as a genuine zero.
 */
export function hasTrustworthyData(state: QueryViewState): boolean {
  return (
    state === "ready" ||
    state === "empty" ||
    state === "refetching" ||
    state === "stale-error"
  );
}

/** Should a full-width error panel replace the content? */
export function showsErrorPanel(state: QueryViewState): boolean {
  return state === "error";
}

/** Should the first-load skeleton be shown instead of content? */
export function showsSkeleton(state: QueryViewState): boolean {
  return state === "initial-loading" || state === "idle";
}

/** Should the empty-state call to action be shown? */
export function showsEmptyState(state: QueryViewState): boolean {
  return state === "empty";
}

/**
 * Should a non-blocking "refreshing" hint be shown alongside existing content?
 * Deliberately excludes the first load, which already has a skeleton.
 */
export function showsRefreshHint(state: QueryViewState): boolean {
  return state === "refetching";
}

/**
 * Should the query cache be dropped because the signed-in wallet changed?
 *
 * `previous` is `undefined` on the first observation, which is not a change.
 * Every later transition — including signing out — clears the cache so one
 * wallet's groups can never be rendered under another's session.
 */
export function shouldResetQueryCache(
  previous: string | null | undefined,
  next: string | null
): boolean {
  if (previous === undefined) return false;
  return previous !== next;
}
