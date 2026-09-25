"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { runOfflineSync } from "@/lib/offlineSync";
import { useOfflineStore } from "@/lib/store/offlineStore";

/**
 * Hosts the browser network listeners for the offline draft queue (#197)
 * and auto-flushes queued drafts whenever connectivity returns.
 *
 * Shows sonner toasts when the user transitions to offline (so they know
 * drafts are being saved locally) and when pending items sync successfully
 * after reconnection.
 *
 * Mount exactly once per session — the AppShell renders it. The manual
 * "Sync now" control lives on the banner and shares the same runner (and
 * its concurrency lock), so a manual and an automatic pass can never post
 * the same draft twice.
 */
export function useOfflineSync(): void {
  useEffect(() => {
    useOfflineStore.getState().setOnline(navigator.onLine);

    const onOnline = () => {
      useOfflineStore.getState().setOnline(true);
      toast.info("Back online — syncing pending drafts…");
      void runOfflineSync();
    };
    const onOffline = () => {
      useOfflineStore.getState().setOnline(false);
      toast.warning("You're offline — new changes will be saved locally", {
        description: "Expenses you add now will sync automatically when the connection returns.",
        duration: 6000,
      });
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // One flush pass on mount, in case drafts were queued in a previous visit
  // and the connection is already back.
  useEffect(() => {
    void runOfflineSync();
  }, []);
}
