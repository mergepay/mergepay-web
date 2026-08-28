"use client";

import { useState } from "react";
import { CloudOff, Loader2, RefreshCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runOfflineSync } from "@/lib/offlineSync";
import { useOfflineStore } from "@/lib/store/offlineStore";

/**
 * Floating status bar for the offline draft queue (#197).
 *
 * Shown whenever there are drafts that have not reached the server yet —
 * while offline it reports that they're saved locally, and once online it
 * lists the pending count with a manual "Sync now" trigger. The banner can
 * be dismissed for the session, but reappears when a new draft is queued or
 * connectivity changes.
 *
 * Styled as a bold neobrutalist card (heavy ink border, bright butter
 * background, hard shadow) so a pending sync can't be missed.
 */
export function OfflineSyncBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isOnline = useOfflineStore((s) => s.isOnline);
  const drafts = useOfflineStore((s) => s.drafts);
  const pending = drafts.filter(
    (d) => d.status === "pending" || d.status === "failed"
  ).length;
  const inFlight = drafts.some((d) => d.status === "syncing");

  if (dismissed && !isOnline) return null;
  if (drafts.length === 0) return null;

  const syncingNow = syncing || inFlight;

  async function handleSyncNow() {
    if (syncingNow) return;
    setSyncing(true);
    try {
      await runOfflineSync();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 w-[min(calc(100vw-2rem),24rem)] rounded-2xl border-3 border-ink bg-butter p-4 shadow-brutal"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-tangerine text-ink shadow-brutal-sm">
          {syncingNow ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isOnline ? (
            <RefreshCcw className="h-5 w-5" />
          ) : (
            <CloudOff className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold uppercase tracking-wide">
            {syncingNow
              ? "Syncing your drafts…"
              : isOnline
                ? `${pending} offline draft${pending === 1 ? "" : "s"} pending`
                : "You're offline — drafts saved"}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-ink/80">
            {isOnline
              ? pending > 0
                ? "These expenses were saved while you were offline. Sync them to your ledger."
                : "All saved drafts are being posted to your ledger."
              : "Expenses you add now are stored locally and sync automatically when the connection returns."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg border-2 border-ink bg-cream p-1 shadow-brutal-sm hover:bg-paper"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!syncingNow && isOnline && pending > 0 && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={handleSyncNow}>
            <RefreshCcw className="h-3.5 w-3.5" /> Sync now
          </Button>
        </div>
      )}
    </div>
  );
}
