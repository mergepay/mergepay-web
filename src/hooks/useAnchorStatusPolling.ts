"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AnchorSession, AnchorSessionStatus } from "@/lib/types";

export const ANCHOR_POLL_INTERVAL_MS = 5_000;

export const TERMINAL_ANCHOR_STATUSES: AnchorSessionStatus[] = [
  "completed",
  "error",
  "refunded",
];

export interface UseAnchorStatusPollingResult {
  session: AnchorSession | null;
  isPolling: boolean;
  isError: boolean;
  refetchNow: () => Promise<void>;
}

export function useAnchorStatusPolling(
  initialSession: AnchorSession | null,
  pollIntervalMs: number = ANCHOR_POLL_INTERVAL_MS
): UseAnchorStatusPollingResult {
  const [session, setSession] = useState<AnchorSession | null>(initialSession);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  const sessionId = session?.id;
  const status = session?.status;
  const isTerminal = status ? TERMINAL_ANCHOR_STATUSES.includes(status) : false;

  const fetchStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { session: updated } = await api.getAnchorSession(sessionId);
      if (mountedRef.current) {
        setSession(updated);
        setIsError(false);
      }
    } catch {
      if (mountedRef.current) {
        setIsError(true);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    mountedRef.current = true;

    if (!sessionId || isTerminal) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    const interval = setInterval(() => {
      void fetchStatus();
    }, pollIntervalMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [sessionId, isTerminal, pollIntervalMs, fetchStatus]);

  return {
    session,
    isPolling,
    isError,
    refetchNow: fetchStatus,
  };
}
