"use client";

import { useEffect, useState } from "react";

export interface NetworkHealthState {
  isOnline: boolean;
  isApiDegraded: boolean;
  latencyMs: number | null;
  lastChecked: number;
}

/**
 * Watches the browser's `online`/`offline` events and periodically pings
 * `/api/health` to detect degraded connectivity.
 *
 * Returns the live {@link NetworkHealthState} and cleans up all listeners
 * on unmount so no intervals or handlers leak.
 */
export function useNetworkStatus(): NetworkHealthState {
  const [status, setStatus] = useState<NetworkHealthState>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isApiDegraded: false,
    latencyMs: null,
    lastChecked: Date.now(),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setStatus((s) => ({ ...s, isOnline: true }));
    const handleOffline = () =>
      setStatus((s) => ({ ...s, isOnline: false, isApiDegraded: false }));

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    let isMounted = true;

    const checkHealth = async () => {
      if (!navigator.onLine) {
        if (isMounted) setStatus((s) => ({ ...s, isOnline: false }));
        return;
      }
      const start = Date.now();
      try {
        const res = await fetch("/api/health", {
          method: "GET",
          cache: "no-store",
        });
        const latency = Date.now() - start;
        if (isMounted) {
          setStatus({
            isOnline: true,
            isApiDegraded: !res.ok || latency > 4000,
            latencyMs: latency,
            lastChecked: Date.now(),
          });
        }
      } catch {
        if (isMounted) {
          setStatus((s) => ({
            ...s,
            isApiDegraded: true,
            latencyMs: null,
            lastChecked: Date.now(),
          }));
        }
      }
    };

    const interval = setInterval(checkHealth, 30000);
    // Initial check
    checkHealth();

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return status;
}
