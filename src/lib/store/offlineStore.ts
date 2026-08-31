"use client";

/**
 * Offline draft queue (#197).
 *
 * Users recording expenses on patchy connections shouldn't lose their work.
 * This store is the single source of truth for "drafts that have not reached
 * the server yet": it persists them to localStorage (via zustand's persist
 * middleware), so a reload keeps the queue, and it tracks the browser's
 * online/offline state so the sync loop knows when it is safe to flush.
 *
 * Every queued draft carries a temporary local identifier (`localId`) and an
 * `idempotencyKey` on the request itself. The localId prevents the same draft
 * from being enqueued twice in this store; the idempotencyKey makes a
 * re-sent request safe against double-creation on the server even if the
 * first attempt actually landed and the response was lost.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CreateExpenseRequest } from "@/lib/types";

export type OfflineDraftStatus = "pending" | "syncing" | "failed";

export interface OfflineDraft {
  /** Temporary client-side identifier; never sent to the server. */
  localId: string;
  groupId: string;
  /** The exact payload the API expects, including its idempotency key. */
  request: CreateExpenseRequest;
  createdAt: number;
  status: OfflineDraftStatus;
}

interface OfflineSyncState {
  /** Browser connectivity as last reported by the network listeners. */
  isOnline: boolean;
  /** Drafts awaiting (or currently being) sync, oldest first. */
  drafts: OfflineDraft[];
  /** When the last sync pass ran, or `null` if never. */
  lastAttemptAt: number | null;
  setOnline: (online: boolean) => void;
  /**
   * Queue a draft. Returns its `localId`. A draft whose `idempotencyKey`
   * is already queued is not duplicated — the existing entry is returned.
   */
  enqueue: (groupId: string, request: CreateExpenseRequest) => string;
  remove: (localId: string) => void;
  markSyncing: (localId: string) => void;
  markFailed: (localId: string) => void;
  markAllPending: () => void;
  clearAll: () => void;
}

/** Fresh idempotency key for a request that did not carry one. */
function freshIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Temporary local identifier, stable across reloads only via persistence. */
function freshLocalId(): string {
  return freshIdempotencyKey();
}

export const useOfflineStore = create<OfflineSyncState>()(
  persist(
    (set, get) => ({
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      drafts: [],
      lastAttemptAt: null,

      setOnline: (online) => set({ isOnline: online }),

      enqueue: (groupId, request) => {
        // A request that failed to send must not be sent twice, even if the
        // user retries the form: reuse the existing queue entry instead.
        const idempotencyKey = request.idempotencyKey ?? freshIdempotencyKey();
        const existing = get().drafts.find(
          (d) => d.request.idempotencyKey === idempotencyKey
        );
        if (existing) return existing.localId;

        const localId = freshLocalId();
        const draft: OfflineDraft = {
          localId,
          groupId,
          request: { ...request, idempotencyKey },
          createdAt: Date.now(),
          status: "pending",
        };
        set({ drafts: [...get().drafts, draft] });
        return localId;
      },

      remove: (localId) =>
        set({ drafts: get().drafts.filter((d) => d.localId !== localId) }),

      markSyncing: (localId) =>
        set({
          drafts: get().drafts.map((d) =>
            d.localId === localId ? { ...d, status: "syncing" } : d
          ),
        }),

      markFailed: (localId) =>
        set({
          drafts: get().drafts.map((d) =>
            d.localId === localId ? { ...d, status: "failed" } : d
          ),
        }),

      markAllPending: () =>
        set({
          drafts: get().drafts.map((d) => ({ ...d, status: "pending" })),
        }),

      clearAll: () => set({ drafts: [] }),
    }),
    {
      name: "mergepay:offline-sync",
      // Only the queue is persisted — connectivity and actions are derived
      // or re-created on boot.
      partialize: (state) => ({ drafts: state.drafts }),
      version: 1,
    }
  )
);

/**
 * Pure helper: the drafts a sync pass should try, oldest first.
 * Failed drafts are retried too — a transient server error on one pass
 * shouldn't strand a draft forever.
 */
export function pendingDrafts(drafts: OfflineDraft[]): OfflineDraft[] {
  return [...drafts]
    .filter((d) => d.status === "pending" || d.status === "failed")
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Pure helper: the queue after one draft has been synced.
 * `ok=true` removes it (it reached the server); `ok=false` marks it failed
 * so the next pass retries it.
 */
export function draftAfterSync(
  drafts: OfflineDraft[],
  localId: string,
  ok: boolean
): OfflineDraft[] {
  if (ok) return drafts.filter((d) => d.localId !== localId);
  return drafts.map((d) =>
    d.localId === localId ? { ...d, status: "failed" } : d
  );
}
