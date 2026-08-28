"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export interface NetworkHealthState {
  isOnline: boolean;
  isApiDegraded: boolean;
  latencyMs: number | null;
  lastChecked: number;
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkHealthState>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isApiDegraded: false,
    latencyMs: null,
    lastChecked: Date.now(),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setStatus((s) => ({ ...s, isOnline: true }));
    const handleOffline = () => setStatus((s) => ({ ...s, isOnline: false }));

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
        const res = await fetch("/api/health", { method: "GET", cache: "no-store" });
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

export function NetworkStatusBanner() {
  const { isOnline, isApiDegraded, latencyMs } = useNetworkStatus();
  const [dismissed, setDismissed] = useState(false);

  if (isOnline && !isApiDegraded) return null;
  if (dismissed && !isOnline) return null;

  return (
    <div
      role="alert"
      className="w-full border-b-2 border-ink bg-mustard-pale px-4 py-2 text-ink transition-all"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between text-xs font-semibold sm:text-sm">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <WifiOff className="h-4 w-4 text-cherry" />
              <span>You are offline. Transactions will be queued once reconnected.</span>
            </>
          ) : isApiDegraded ? (
            <>
              <AlertTriangle className="h-4 w-4 text-mustard-dark" />
              <span>
                Network latency detected ({latencyMs ? `${latencyMs}ms` : "RPC degraded"}). Stellar operations may be delayed.
              </span>
            </>
          ) : null}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-md border border-ink bg-white px-2 py-0.5 text-xs font-bold hover:bg-ink/5"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}