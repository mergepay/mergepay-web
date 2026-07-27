"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Authenticated segment error caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border-3 border-ink bg-flamingo shadow-brutal text-ink">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <h2 className="font-display text-2xl uppercase tracking-tight text-ink md:text-3xl">
        Something went wrong!
      </h2>
      <p className="mx-auto mt-3 max-w-md font-body text-sm font-semibold text-ink/60">
        {error.message || "An unexpected error occurred in the application."}
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Button onClick={() => reset()} variant="secondary">
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          Reload page
        </Button>
      </div>
    </div>
  );
}
