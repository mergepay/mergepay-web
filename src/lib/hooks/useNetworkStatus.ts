"use client";

import { useEffect, useState, useCallback } from "react";

export interface NetworkHealthState {
  isOnline: boolean;
  isApiDegraded: boolean;
  latencyMs: number | null;
  lastChecked: number;
}

/**
 * Watches browser online/offline events and performs heartbeat checks against /api/health.
 * Exposes auto-retry / refetch callbacks when connectivity is restored.
 */
export function useNetworkStatus(): NetworkHealthState & { refetch: () => Promise<void> } {
  const [status, setStatus] = useState<NetworkHealthState>(() => ({
    // The first client render must match the server output. Node >= 21 exposes
    // a bare global `navigator` without `onLine`, so reading it here makes the
    // server render "offline" while the browser renders "online" — React then
    // throws hydration error #418/#423 and replaces the whole root. The effect
    // below applies the real connectivity state right after mount.
    isOnline: true,
    isApiDegraded: false,
    latencyMs: null,
    lastChecked: Date.now(),
  }));

  const checkHealth = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus((s) => ({ ...s, isOnline: false, isApiDegraded: false }));
      return;
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const latency = Date.now() - start;
      setStatus({
        isOnline: true,
        isApiDegraded: !res.ok || latency > 4000,
        latencyMs: latency,
        lastChecked: Date.now(),
      });
    } catch {
      setStatus((s) => ({
        ...s,
        isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
        isApiDegraded: true,
        latencyMs: null,
        lastChecked: Date.now(),
      }));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setStatus((s) => ({ ...s, isOnline: true }));
      void checkHealth();
    };
    const handleOffline = () => {
      setStatus((s) => ({ ...s, isOnline: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(checkHealth, 30000);
    void checkHealth();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkHealth]);

  return {
    ...status,
    refetch: checkHealth,
  };
}
