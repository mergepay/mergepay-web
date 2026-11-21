"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, AlertTriangle, RefreshCw } from "lucide-react";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";
import { cn } from "@/lib/utils";

export interface NetworkStatusBannerProps {
  className?: string;
}

/**
 * Global network status warning banner following the neobrutalist design system.
 * Announces state changes via aria-live="polite" and automatically dismisses/triggers
 * data refetching when connection is restored.
 */
export function NetworkStatusBanner({ className }: NetworkStatusBannerProps) {
  const { isOnline, isApiDegraded, latencyMs, refetch } = useNetworkStatus();
  const [userDismissed, setUserDismissed] = useState(false);

  // Automatically reset user dismissal when connection drops again
  useEffect(() => {
    if (!isOnline || isApiDegraded) {
      setUserDismissed(false);
    }
  }, [isOnline, isApiDegraded]);

  const shouldShow = (!isOnline || isApiDegraded) && !userDismissed;

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="network-status-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "sticky top-0 z-50 overflow-hidden border-b-[3px] border-ink bg-mustard px-4 py-3 shadow-brutal-sm",
            !isOnline ? "bg-flamingo text-ink" : "bg-mustard text-ink",
            className
          )}
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-xs sm:text-sm font-black uppercase tracking-[0.1em]">
            <div className="flex items-center gap-2.5">
              {!isOnline ? (
                <>
                  <WifiOff className="h-4 w-4 shrink-0 text-ink" />
                  <span>You are currently offline. Stellar transactions and balance syncing are paused.</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-ink" />
                  <span>
                    Network latency detected {latencyMs ? `(${latencyMs}ms)` : "(API degraded)"}. Operations may be delayed.
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-cream px-2.5 py-1 text-xs font-bold shadow-brutal-sm hover:bg-paper transition-colors"
                aria-label="Retry connection"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={() => setUserDismissed(true)}
                className="rounded-lg border-2 border-ink bg-cream px-2.5 py-1 text-xs font-bold shadow-brutal-sm hover:bg-paper transition-colors"
                aria-label="Dismiss network banner"
              >
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default NetworkStatusBanner;
