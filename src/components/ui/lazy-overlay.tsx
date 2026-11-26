"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Building blocks for code-split overlays (#887).
 *
 * Heavy modals (the expense form, the SEP-24 ramp, QR sharing, CSV export…) are
 * loaded with `next/dynamic` so their code is not in a page's initial bundle.
 * Two pieces make that safe for users:
 *
 * - {@link useMountOnFirstOpen} keeps a lazy modal out of the tree until the
 *   user first opens it, so its chunk is fetched on demand instead of on page
 *   load. After that it stays mounted, so closing it behaves exactly as before:
 *   focus is restored by the dialog itself and exit animations still run.
 * - {@link ModalLoadingFallback} is what shows during the brief chunk fetch. It
 *   is a fixed overlay styled like the real dialogs, so the page underneath
 *   never shifts and the click gets immediate visual feedback.
 */

/** `true` from the first render where `open` is true, and forever after. */
export function useMountOnFirstOpen(open: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(open);
  // Set during render rather than in an effect, so the lazy modal mounts in
  // the same commit that opens it, with no extra frame of nothing.
  if (open && !hasOpened) setHasOpened(true);
  return hasOpened || open;
}

export interface ModalLoadingFallbackProps {
  /** Accessible status text announced while the dialog's code loads. */
  label?: string;
  className?: string;
}

/**
 * Placeholder for a dialog whose code is still loading. Mirrors the
 * `Dialog` shell (backdrop, bordered paper panel, hard shadow, title rule) so
 * swapping in the real dialog is a content change, not a layout jump.
 */
export function ModalLoadingFallback({ label = "Loading dialog…", className }: ModalLoadingFallbackProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="modal-loading-fallback"
    >
      <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn(
          "relative z-10 flex w-full max-w-[calc(100vw-2rem)] flex-col rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal sm:max-w-lg sm:p-6",
          className
        )}
      >
        <span className="sr-only">{label}</span>
        <div className="flex items-center justify-between border-b-2 border-ink pb-4" aria-hidden="true">
          <div className="h-5 w-1/2 animate-pulse rounded-lg bg-ink/15" />
          <div className="h-8 w-8 rounded-lg border-2 border-ink/20" />
        </div>
        <div className="space-y-3 pt-4" aria-hidden="true">
          <div className="h-4 w-1/3 animate-pulse rounded bg-ink/15" />
          <div className="h-11 w-full animate-pulse rounded-xl border-2 border-ink/20 bg-ink/5" />
          <div className="h-4 w-1/4 animate-pulse rounded bg-ink/15" />
          <div className="h-11 w-full animate-pulse rounded-xl border-2 border-ink/20 bg-ink/5" />
          <div className="ml-auto h-11 w-32 animate-pulse rounded-xl border-2 border-ink bg-ink/15 shadow-brutal-sm" />
        </div>
      </div>
    </div>
  );
}

export interface PanelLoadingFallbackProps {
  /** Reserve the panel's real height so content below does not jump. */
  minHeightClass?: string;
  label?: string;
}

/** In-flow placeholder for a lazily loaded card or chart panel. */
export function PanelLoadingFallback({
  minHeightClass = "min-h-[16rem]",
  label = "Loading…",
}: PanelLoadingFallbackProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="panel-loading-fallback"
      className={cn("rounded-2xl border-3 border-ink bg-paper p-5 shadow-brutal", minHeightClass)}
    >
      <span className="sr-only">{label}</span>
      <div className="space-y-3" aria-hidden="true">
        <div className="h-5 w-1/3 animate-pulse rounded-lg bg-ink/15" />
        <div className="h-24 w-full animate-pulse rounded-xl border-2 border-ink/20 bg-ink/5" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-ink/15" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-ink/15" />
      </div>
    </div>
  );
}
