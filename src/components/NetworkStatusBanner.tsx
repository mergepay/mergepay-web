"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type ConnectionState = "online" | "offline" | "reconnected";
const RECONNECTED_DURATION_MS = 4000;

/**
 * Browser connectivity is a hint, not a guarantee that Stellar or the API is
 * reachable. Never imply that transactions are queued or automatically retried.
 */
export function NetworkStatusBanner() {
  const [connection, setConnection] = useState<ConnectionState>("online");

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    };

    const handleOffline = () => {
      clearReconnectTimer();
      setConnection("offline");
    };

    const handleOnline = () => {
      clearReconnectTimer();
      setConnection((previous) => previous === "offline" ? "reconnected" : "online");
      reconnectTimer = setTimeout(() => setConnection("online"), RECONNECTED_DURATION_MS);
    };

    // Read navigator only after mount to avoid server/client hydration mismatch.
    if (!navigator.onLine) handleOffline();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      clearReconnectTimer();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (connection === "online") return null;

  const offline = connection === "offline";

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 pointer-events-none sm:px-6">
      <Card
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 ${offline ? "bg-flamingo-pale" : "bg-lime-pale"}`}
        data-testid="network-status-banner"
      >
        {offline ? <WifiOff aria-hidden="true" className="h-5 w-5 shrink-0" /> : <Wifi aria-hidden="true" className="h-5 w-5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm uppercase">
            {offline ? "You're offline" : "Connection restored"}
          </p>
          <p className="text-xs sm:text-sm">
            {offline
              ? "Check your internet connection before submitting or retrying transactions."
              : "You're back online. Check any pending transactions before trying again."}
          </p>
        </div>
        <Badge tone={offline ? "flamingo" : "lime"}>{offline ? "Offline" : "Online"}</Badge>
      </Card>
    </div>
  );
}
