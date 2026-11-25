"use client";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { createQueryClient } from "@/lib/queryClient";
import { subscribeToSessionExpired } from "@/lib/sessionMonitor";
import { toast } from "sonner";
import { useSessionRestore } from "@/hooks/useSessionRestore";

/**
 * Runs the one-time wallet session restore. It lives inside the query
 * provider because a restore may need to clear or refetch cached data,
 * and it renders nothing — the restoring state is read from the auth
 * store by whichever surface needs to show it.
 */
function SessionRestore() {
  useSessionRestore();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session, created lazily inside useState so
  // SSR never shares a cache between requests.
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    // Session endings are announced through a DOM event (see
    // `src/lib/sessionMonitor.ts`) instead of a single module callback. That
    // lets the 401 interceptor, the JWT watcher and the idle watchdog all
    // reach the same cleanup without importing each other, and guarantees the
    // query cache is purged before anything can render account data (#898).
    return subscribeToSessionExpired((detail) => {
      queryClient.clear();
      toast.error(
        detail.reason === "idle_timeout"
          ? "Your session expired due to inactivity. Please sign in again."
          : "Your session expired. Please sign in again."
      );
    });
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionRestore />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className:
              "animate-fade-in !bg-cream !text-ink !border-[3px] !border-ink !rounded-2xl !shadow-[4px_4px_0_0_#18130E] !font-bold",
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
