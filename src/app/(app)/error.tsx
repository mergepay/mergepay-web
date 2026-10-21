"use client";

import { useEffect } from "react";
import { AlertTriangle, LayoutDashboard, RotateCcw, RefreshCw } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { logRenderError } from "@/lib/errorHandler";

/** Next.js App Router fallback for errors within the authenticated route group. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logRenderError(error, {
      componentStack: error.digest ? `digest ${error.digest}` : null,
    });
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-4">
      <section
        role="alert"
        className="w-full max-w-lg space-y-5 rounded-2xl border-3 border-ink bg-flamingo-pale p-6 shadow-brutal sm:p-8"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-flamingo shadow-brutal-sm">
            <AlertTriangle className="h-7 w-7 text-ink" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-2xl uppercase tracking-tight text-ink">
              Something went wrong
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink/70">
              We couldn't load this page. Try again or return to your dashboard.
            </p>
          </div>
        </div>

        {process.env.NODE_ENV !== "production" ? (
          <p className="max-h-32 overflow-auto rounded-xl border-2 border-ink bg-white p-3 font-mono text-xs text-ink/80">
            {error.message}
          </p>
        ) : error.digest ? (
          <p className="rounded-xl border-2 border-ink bg-white p-3 font-mono text-xs text-ink/80">
            Error reference: {error.digest}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="primary" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reload page
          </Button>
          <a href="/dashboard" className={buttonClassName("outline", "md")}>
            <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" />
            Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
