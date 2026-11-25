"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface OfflineBannerProps {
  className?: string;
}

/**
 * Global offline detection banner adhering to the Mergepay neobrutalist design system.
 * Appears automatically when navigator.onLine is false or when the browser
 * fires an 'offline' window event, and dismisses smoothly on reconnection.
 */
export function OfflineBanner({ className }: OfflineBannerProps) {
  // Start "online" so the first client render of the SSR HTML is identical;
  // reading `navigator.onLine` synchronously in the initializer instead makes
  // the constructor diverge from the server (Node ≥21 exposes a bare global
  // `navigator` whose `onLine` is undefined, i.e. falsy "offline"), which
  // throws React hydration error #418/#423 on every page and replaces the
  // whole document with client content.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let wasOffline = navigator.onLine === false;
    const handleOnline = () => {
      if (wasOffline) toast.success("Connection restored");
      wasOffline = false;
      setIsOnline(true);
    };
    const handleOffline = () => {
      wasOffline = true;
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check
    setIsOnline(!wasOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline-banner"
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "sticky top-0 z-50 border-b-[3px] border-ink bg-flamingo px-4 py-3 shadow-brutal-sm text-ink",
            className
          )}
          role="alert"
          aria-live="assertive"
          data-testid="offline-banner"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-center gap-2.5 text-xs sm:text-sm font-black uppercase tracking-[0.12em] text-ink">
            <WifiOff className="h-4 w-4 shrink-0 text-ink" />
            <span>You are currently offline. Stellar transactions and balance syncing are paused.</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineBanner;
