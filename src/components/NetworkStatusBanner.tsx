"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, AlertTriangle } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/**
 * Global connection banner that smoothly animates into view when the
 * browser goes offline or the API health check degrades.
 *
 * Uses framer-motion for a slide-down entrance / exit and neobrutalist
 * styling (thick borders, high-contrast warning colors) per the design
 * system.
 */
export function NetworkStatusBanner() {
  const { isOnline, isApiDegraded, latencyMs } = useNetworkStatus();
  const [dismissed, setDismissed] = useState(false);

  const visible = (!isOnline || isApiDegraded) && !(dismissed && !isOnline);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="network-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="overflow-hidden border-b-3 border-ink bg-mustard-pale"
          role="alert"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 text-xs font-semibold sm:text-sm">
            <div className="flex items-center gap-2">
              {!isOnline ? (
                <>
                  <WifiOff className="h-4 w-4 shrink-0 text-flamingo" />
                  <span>You are offline. Transactions will be queued once reconnected.</span>
                </>
              ) : isApiDegraded ? (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-tangerine-dark" />
                  <span>
                    Network latency detected ({latencyMs ? `${latencyMs}ms` : "RPC degraded"}). Stellar operations may be delayed.
                  </span>
                </>
              ) : null}
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-lg border-2 border-ink bg-cream px-2.5 py-1 text-xs font-bold shadow-brutal-sm hover:bg-paper transition-colors"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}