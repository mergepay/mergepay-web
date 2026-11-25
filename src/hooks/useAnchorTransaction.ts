"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AnchorTransactionStatus =
  | "incomplete"
  | "pending_user_transfer_start"
  | "pending_external"
  | "pending_anchor"
  | "no_market_active"
  | "completed"
  | "error"
  | "refunded";

export interface AnchorTransactionLike {
  id?: string | null;
  status?: AnchorTransactionStatus | string | null;
  interactiveUrl?: string | null;
  kind?: "deposit" | "withdrawal" | string | null;
  assetCode?: string | null;
  anchorName?: string | null;
  message?: string | null;
  externalTransactionId?: string | null;
  [key: string]: unknown;
}

export interface UseAnchorTransactionOptions<T = AnchorTransactionLike> {
  pollIntervalMs?: number;
  enabled?: boolean;
  fetchStatus?: (id: string) => Promise<T | null>;
}

export interface UseAnchorTransactionResult<T = AnchorTransactionLike> {
  transaction: T | null;
  status: AnchorTransactionStatus | string;
  isPolling: boolean;
  isConnected: boolean;
  isTerminal: boolean;
  requiresAction: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const TERMINAL_STATUS_VALUES = new Set(["completed", "error", "refunded"]);

function coerceStatus(value: unknown): AnchorTransactionStatus | string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || "incomplete";
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUS_VALUES.has(status);
}

function normalizeTransaction<T>(value: T | null | undefined): T | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const nested =
    (source.transaction as Record<string, unknown> | undefined) ??
    (source.session as Record<string, unknown> | undefined) ??
    (source.data as Record<string, unknown> | undefined) ??
    (source.result as Record<string, unknown> | undefined) ??
    source;

  const status = coerceStatus(
    nested.status ?? source.status ?? nested.state ?? source.state ?? "incomplete"
  );

  return {
    ...source,
    ...nested,
    status,
    id: String(nested.id ?? source.id ?? ""),
    interactiveUrl: (nested.interactiveUrl ?? source.interactiveUrl ?? null) as string | null,
    kind: (nested.kind ?? source.kind ?? null) as AnchorTransactionLike["kind"],
    assetCode: (nested.assetCode ?? source.assetCode ?? null) as string | null,
    anchorName: (nested.anchorName ?? source.anchorName ?? null) as string | null,
    message: (nested.message ?? source.message ?? null) as string | null,
    externalTransactionId: (nested.externalTransactionId ?? source.externalTransactionId ?? null) as string | null,
  } as T;
}

export function useAnchorTransaction<T extends AnchorTransactionLike>(
  initialTransaction: T | null,
  options: UseAnchorTransactionOptions<T> = {}
): UseAnchorTransactionResult<T> {
  const {
    pollIntervalMs = 5_000,
    enabled = true,
    fetchStatus,
  } = options;

  const [transaction, setTransaction] = useState<T | null>(initialTransaction ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isConnected, setIsConnected] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  const lastPollRef = useRef(0);
  const transactionId = useMemo(
    () => (transaction?.id ? String(transaction.id) : null),
    [transaction]
  );

  useEffect(() => {
    setTransaction(initialTransaction ?? null);
  }, [initialTransaction]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!transactionId || !enabled || !fetchStatus) {
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsConnected(false);
      return;
    }

    lastPollRef.current = Date.now();
    setIsPolling(true);
    setError(null);

    try {
      const next = await fetchStatus(transactionId);
      const normalized = normalizeTransaction(next) as T | null;
      if (normalized) {
        setTransaction(normalized);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to refresh anchor status.";
      setError(message);
    } finally {
      setIsPolling(false);
    }
  }, [enabled, fetchStatus, transactionId]);

  useEffect(() => {
    if (!enabled || !transactionId || !fetchStatus) {
      setIsPolling(false);
      return;
    }

    const status = coerceStatus(transaction?.status ?? "incomplete");
    if (isTerminalStatus(String(status))) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    const tick = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsConnected(false);
        return;
      }

      const now = Date.now();
      const elapsed = now - lastPollRef.current;
      if (elapsed < pollIntervalMs) {
        return;
      }

      await refresh();
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, fetchStatus, pollIntervalMs, refresh, transaction?.status, transactionId]);

  const status = coerceStatus(transaction?.status ?? "incomplete");
  const isTerminal = isTerminalStatus(String(status));
  const requiresAction = Boolean(
    transaction?.interactiveUrl && !isTerminal && ["pending_external", "pending_user_transfer_start"].includes(String(status))
  );

  return {
    transaction,
    status,
    isPolling,
    isConnected,
    isTerminal,
    requiresAction,
    error,
    refresh,
  };
}
