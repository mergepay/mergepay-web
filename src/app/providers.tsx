"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { createQueryClient } from "@/lib/queryClient";

export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session, created lazily inside useState so
  // SSR never shares a cache between requests.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
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
