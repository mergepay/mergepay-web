"use client";

import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError, ApiValidationError, isSessionExpired } from "./api";

/**
 * Global React Query caching strategy.
 *
 * List-style data (groups, expenses, ledger, treasury, history) changes
 * rarely and is always re-validated by `invalidateQueries` after every
 * mutation, so a modest `staleTime` is safe: navigating between pages or
 * re-focusing the tab renders cached data instantly (stale-while-revalidate)
 * instead of re-fetching on every mount. Mutations still force a refetch via
 * invalidation — `staleTime` only affects reads, never write-through.
 */

/**
 * How long a query's data is considered fresh. While fresh, mounts and
 * window-focus events do not trigger a network request.
 */
export const DEFAULT_STALE_TIME_MS = 30_000; // 30 seconds

/**
 * How long unused query data stays in memory before being garbage-collected.
 * Kept well above `staleTime` so back-navigation within a session is served
 * from cache.
 */
export const DEFAULT_GC_TIME_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Maximum number of automatic retries for a failed query. Combined with the
 * terminal-error guards below, transient network/5xx failures retry at most
 * twice before surfacing to the UI.
 */
export const DEFAULT_RETRY_COUNT = 2;

/**
 * Create the app's singleton QueryClient with project-wide defaults.
 *
 * A factory (rather than a module-level instance) keeps the client out of
 * module scope so each browser session — and each React state initializer —
 * gets a fresh, isolated cache.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        // Revalidate stale queries when the user returns to the tab; fresh
        // queries (within `staleTime`) are served from cache without a fetch.
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // Never retry once the session is gone — a login is required.
          if (isSessionExpired()) return false;
          // Client errors (4xx) are deterministic; retrying won't change them.
          if (
            error instanceof ApiRequestError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            return false;
          }
          // A schema-validated 200 response is not going to become
          // valid on the next attempt. Never retry validation errors
          // — the next polling tick will surface fresh data.
          if (error instanceof ApiValidationError) {
            return false;
          }
          return failureCount < DEFAULT_RETRY_COUNT;
        },
      },
    },
  });
}
