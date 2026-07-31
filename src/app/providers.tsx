"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { createQueryClient } from "@/lib/queryClient";
import { ApiRequestError, ApiValidationError, isSessionExpired } from "@/lib/api";
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

  return (
    <QueryClientProvider client={queryClient}>
      <SessionRestore />
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "animate-fade-in !bg-cream !text-ink !border-[3px] !border-ink !rounded-2xl !shadow-[4px_4px_0_0_#18130E] !font-bold",
        }}
      />
    </QueryClientProvider>
  );
}
