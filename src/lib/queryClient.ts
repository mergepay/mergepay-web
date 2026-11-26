"use client";

import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isSessionExpired } from "./api";
import {
  MAX_TRANSIENT_RETRIES,
  retryDelayWithBackoff,
  shouldRetryRequest,
} from "./retryPolicy";

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
 * Maximum number of automatic retries for a failed query (#900). Only
 * transient failures — network errors, timeouts, 408/429 and 5xx from
 * Horizon or mergepay-api — are retried; 4xx and schema-validation errors
 * fail fast. See `src/lib/retryPolicy.ts`.
 */
export const DEFAULT_RETRY_COUNT = MAX_TRANSIENT_RETRIES;

/**
 * Global `retry` predicate: never retry once the session has ended (a login
 * is required), otherwise defer to the shared transient-error policy.
 */
export function queryRetry(failureCount: number, error: unknown): boolean {
  if (isSessionExpired()) return false;
  return shouldRetryRequest(failureCount, error, {
    maxRetries: DEFAULT_RETRY_COUNT,
  });
}

/**
 * Global `retryDelay`: exponential backoff (1s, 2s, 4s… capped at 30s) with
 * a little jitter so many tabs retrying after a Horizon blip do not land in
 * the same instant. A server `Retry-After` hint is honoured when longer.
 */
export function queryRetryDelay(failureCount: number, error: unknown): number {
  return retryDelayWithBackoff(failureCount, error, { jitter: 0.2 });
}

/**
 * Create the app's singleton QueryClient with project-wide defaults.
 *
 * A factory (rather than a module-level instance) keeps the client out of
 * module scope so each browser session — and each React state initializer —
 * gets a fresh, isolated cache.
 */
export function createQueryClient(): QueryClient {
  const mutationCache = new MutationCache({
    onMutate: () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.error("You are currently offline. Please reconnect before submitting changes.");
      }
    },
    onError: () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.error("Network unavailable. Your transaction could not be submitted.");
      }
      // Leave mutations in a recoverable state while the browser is offline so
      // they can resume cleanly once connectivity returns. The app-level forms
      // already gate submit buttons when `navigator.onLine` is false.
    },
  });

  return new QueryClient({
    mutationCache,
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        networkMode: "offlineFirst",
        // Revalidate stale queries when the user returns to the tab while online;
        // fresh queries (within `staleTime`) or offline state avoids futile network hits.
        refetchOnWindowFocus: () => (typeof navigator !== "undefined" ? navigator.onLine : true),
        retry: queryRetry,
        retryDelay: queryRetryDelay,
      },
      mutations: {
        networkMode: "always",
        // Mutations submit transactions and create records, which are not
        // idempotent in general: a retry after a timeout could double-submit
        // a payment. They stay opt-in per hook — expense creation retries
        // with an idempotency key (see `shouldRetryExpenseCreate` in
        // queries.ts) — rather than inheriting the query policy.
        retry: false,
        throwOnError: false,
      },
    },
  });
}
