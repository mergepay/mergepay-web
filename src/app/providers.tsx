"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ApiRequestError, isSessionExpired } from "@/lib/api";

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
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "!bg-cream !text-ink !border-[3px] !border-ink !rounded-2xl !shadow-[4px_4px_0_0_#18130E] !font-bold",
        }}
      />
    </QueryClientProvider>
  );
}
