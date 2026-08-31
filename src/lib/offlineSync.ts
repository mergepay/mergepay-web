"use client";

/**
 * Offline draft sync runner (#197).
 *
 * Posts queued drafts to the backend in order (oldest first) so the ledger
 * order matches what the user recorded. Each success removes the draft and
 * toasts; a failing draft is marked `failed` and the pass moves on, so one
 * dead request never blocks the rest of the queue.
 *
 * A module-level lock keeps the auto-flush (network listener) and the manual
 * "Sync now" button from posting the same draft twice. Even if two passes
 * ever did race, every queued request carries its idempotency key, so the
 * server would refuse to create a duplicate.
 */

import { toast } from "sonner";
import { api } from "./api";
import {
  draftAfterSync,
  pendingDrafts,
  useOfflineStore,
} from "./store/offlineStore";

let running = false;

export interface OfflineSyncResult {
  synced: number;
  failed: number;
}

/**
 * One sync pass over the queue. Returns `{ synced, failed }` counts, or a
 * zero result when a pass is already running, the browser is offline, or
 * there is nothing to sync.
 */
export async function runOfflineSync(): Promise<OfflineSyncResult> {
  if (running) return { synced: 0, failed: 0 };

  const store = useOfflineStore.getState();
  if (!store.isOnline) return { synced: 0, failed: 0 };

  const queue = pendingDrafts(store.drafts);
  if (queue.length === 0) return { synced: 0, failed: 0 };

  running = true;
  useOfflineStore.setState({ lastAttemptAt: Date.now() });
  let synced = 0;
  let failed = 0;

  try {
    for (const draft of queue) {
      // A connection can drop mid-pass; stop posting until we're back online.
      if (!useOfflineStore.getState().isOnline) break;
      useOfflineStore.getState().markSyncing(draft.localId);
      try {
        await api.createExpense(draft.groupId, draft.request);
        useOfflineStore.setState((s) => ({
          drafts: draftAfterSync(s.drafts, draft.localId, true),
        }));
        synced += 1;
        toast.success(`Synced "${draft.request.title}" to your ledger`);
      } catch {
        useOfflineStore.setState((s) => ({
          drafts: draftAfterSync(s.drafts, draft.localId, false),
        }));
        failed += 1;
      }
    }
  } finally {
    running = false;
  }

  if (failed > 0) {
    toast.error(
      `${failed} offline draft${failed === 1 ? "" : "s"} could not be synced. They'll be retried automatically.`
    );
  }
  return { synced, failed };
}
