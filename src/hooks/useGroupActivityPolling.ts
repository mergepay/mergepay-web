"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { api } from "@/lib/api";
import type { GroupActivityResponse } from "@/lib/types";

/** Default polling interval in milliseconds. */
export const DEFAULT_ACTIVITY_POLL_INTERVAL_MS = 15_000;

/** Maximum consecutive failures before polling is considered stalled. */
export const ACTIVITY_POLL_MAX_FAILURES = 5;

export interface UseGroupActivityPollingOptions {
  /** Polling interval in ms. Set to 0 or false to disable polling. */
  intervalMs?: number | false;
  /** Whether the hook is enabled (default true). */
  enabled?: boolean;
}

export interface UseGroupActivityPollingResult {
  activities: GroupActivityResponse["activities"];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  isPolling: boolean;
  pollingStalled: boolean;
}

/**
 * Polls group activity at a configurable interval, pausing when the
 * browser tab is hidden to conserve bandwidth and battery.
 *
 * Wraps the existing `useGroupActivity` query with:
 * - Configurable `refetchInterval` (default 15 s)
 * - Visibility API integration: polling stops when `document.hidden`
 *   and resumes on tab focus
 * - Failure tracking: after `ACTIVITY_POLL_MAX_FAILURES` consecutive
 *   failures the hook stops polling and exposes `pollingStalled`
 */
export function useGroupActivityPolling(
  groupId: string,
  options: UseGroupActivityPollingOptions = {}
): UseGroupActivityPollingResult {
  const {
    intervalMs = DEFAULT_ACTIVITY_POLL_INTERVAL_MS,
    enabled = true,
  } = options;

  const qc = useQueryClient();
  const failureCountRef = useRef(0);
  const [pollingStalled, setPollingStalled] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return !document.hidden;
  });

  // Track document visibility changes
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      setIsDocumentVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const query = useQuery({
    queryKey: qk.activity(groupId),
    queryFn: () => api.getGroupActivity(groupId),
    staleTime: 5_000,
    enabled: enabled && Boolean(groupId),
    refetchInterval:
      intervalMs !== false && intervalMs > 0
        ? (q) => {
            // Stop polling when document is hidden
            if (typeof document !== "undefined" && document.hidden) {
              return false;
            }
            // Stop polling if stalled
            if (pollingStalled) return false;
            // Stop polling if the query is in error state
            if (q.state.status === "error") return false;
            return intervalMs;
          }
        : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  // Track consecutive failures
  useEffect(() => {
    if (query.isError) {
      failureCountRef.current += 1;
      if (failureCountRef.current >= ACTIVITY_POLL_MAX_FAILURES) {
        setPollingStalled(true);
      }
    } else if (query.isSuccess) {
      failureCountRef.current = 0;
      setPollingStalled(false);
    }
  }, [query.isError, query.isSuccess, query.errorUpdatedAt, query.dataUpdatedAt]);

  // Force-refetch the query
  const refetch = useCallback(() => {
    failureCountRef.current = 0;
    setPollingStalled(false);
    void qc.invalidateQueries({ queryKey: qk.activity(groupId) });
  }, [qc, groupId]);

  const isPolling =
    !pollingStalled &&
    intervalMs !== false &&
    intervalMs > 0 &&
    isDocumentVisible &&
    enabled;

  return {
    activities: query.data?.activities ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch,
    isPolling,
    pollingStalled,
  };
}

/**
 * Pure helper: determine the effective polling interval based on
 * visibility and failure state. Exported for unit testing.
 */
export function effectiveActivityPollInterval(args: {
  configuredMs: number | false;
  documentHidden: boolean;
  pollingStalled: boolean;
  isError: boolean;
}): number | false {
  const { configuredMs, documentHidden, pollingStalled, isError } = args;
  if (configuredMs === false || configuredMs <= 0) return false;
  if (documentHidden) return false;
  if (pollingStalled) return false;
  if (isError) return false;
  return configuredMs;
}
