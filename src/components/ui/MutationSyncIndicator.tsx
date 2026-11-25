"use client";

import { useIsMutating } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

/**
 * Non-blocking background synchronization indicator (#375).
 *
 * Renders a small spinning badge in the bottom-right corner while any
 * React Query mutation is in-flight. It is:
 *  - entirely non-blocking — it never intercepts user input
 *  - accessible — uses role="status" + aria-live="polite" so screen
 *    readers announce "Syncing…" without interrupting the user
 *  - invisible when no mutation is pending (zero DOM footprint)
 *
 * Because it subscribes to the global mutation count rather than a
 * specific hook, it covers both expense creation and deletion (and any
 * future mutation) without extra wiring.
 */
export function MutationSyncIndicator() {
  const mutating = useIsMutating();

  if (mutating === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Saving changes…"
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl border-3 border-ink bg-butter px-3 py-1.5 shadow-brutal animate-fade-in"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-ink/70" aria-hidden="true" />
      <span className="font-display text-[11px] font-bold uppercase tracking-widest text-ink/80">
        Syncing…
      </span>
    </div>
  );
}
