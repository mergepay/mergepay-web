"use client";

import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { logRenderError } from "@/lib/errorHandler";
// The root layout is not part of this render, so its stylesheet import is
// gone with it. Re-importing keeps the fallback in the design system instead
// of a bare white page.
import "./globals.css";

interface Props {
  error: Error & { digest?: string };
}

/**
 * Last-resort boundary for the root segment (#527).
 *
 * Next.js only reaches this file when nothing below can absorb the failure —
 * a crash in the root layout, the providers, or a route outside the `(app)`
 * group's own boundaries. Because it replaces the whole document, it has to
 * render `<html>`/`<body>` itself.
 */
export default function GlobalError({ error }: Props) {
  useEffect(() => {
    logRenderError(error, {
      componentStack: error.digest ? `digest ${error.digest}` : null,
    });
    // The boundary is mounted once per crash; `error` is stable for that crash.
  }, [error]);

  const reload = () => {
    // Full document reload, not a client transition: the tree that threw is
    // the one we are about to render again, so only a fresh boot can escape it.
    window.location.reload();
  };

  return (
    <html lang="en">
      {/* Keep the body classes the root layout would normally set. */}
      <body className="bg-paper font-body text-ink">
        <main className="flex min-h-screen items-center justify-center p-4">
          <div
            role="alert"
            aria-live="assertive"
            className="w-full max-w-lg space-y-4 rounded-2xl border-3 border-ink bg-flamingo-pale p-6 shadow-brutal"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-flamingo text-ink shadow-brutal-sm">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <div>
                <h1 className="font-display text-lg font-bold uppercase tracking-tight text-ink">
                  Mergepay hit an error
                </h1>
                <p className="text-xs text-ink/70">
                  Something unexpected broke the page before it could render.
                  None of your money moved.
                </p>
              </div>
            </div>

            {process.env.NODE_ENV !== "production" ? (
              <div className="max-h-32 overflow-auto rounded-xl border-2 border-ink bg-white p-3 font-mono text-xs text-ink/80">
                {error.message}
              </div>
            ) : (
              <p className="rounded-xl border-2 border-ink bg-white p-3 font-mono text-xs text-ink/80">
                {/* Only the server-side digest is safe to show: it correlates
                    with the logged failure without exposing the message. */}
                Reference: {error.digest ?? "unknown"}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <a href="/" className={buttonClassName("outline", "md")}>
                <Home className="mr-1 h-4 w-4" />
                Back to start
              </a>
              <Button onClick={reload} variant="primary">
                <RefreshCw className="mr-1 h-4 w-4" />
                Reload
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
