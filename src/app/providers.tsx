"use client";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { createQueryClient } from "@/lib/queryClient";
import { setSessionExpiredHandler } from "@/lib/api";
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
    setSessionExpiredHandler(() => {
      queryClient.clear();
      toast.error("Your session expired. Please sign in again.");
    });
    return () => setSessionExpiredHandler(null);
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
