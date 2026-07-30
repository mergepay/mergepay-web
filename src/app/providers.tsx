"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
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
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (isSessionExpired()) return false;
              if (
                error instanceof ApiRequestError &&
                error.status >= 400 &&
                error.status < 500
              ) {
                return false;
              }
              // A schema-validated 200 response is not going to become
              // valid on the next attempt. Never retry validation errors
              // — the next polling tick will surface fresh data.
              if (error instanceof ApiValidationError) {
                return false;
              }
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
            staleTime: 15_000,
          },
        },
      })
  );

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
