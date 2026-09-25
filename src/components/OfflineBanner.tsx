"use client";

import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="sticky top-0 z-40 border-b-[3px] border-ink bg-flamingo px-4 py-3 shadow-brutal-sm"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-ink">
            <WifiOff className="h-4 w-4" />
            <span>You’re offline</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
