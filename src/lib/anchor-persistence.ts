/**
 * Persistence layer for anchor operations.
 *
 * Stores only non-sensitive identifiers (session IDs) scoped to the active
 * wallet account. Never persists secrets, wallet keys, or payment credentials.
 *
 * Uses localStorage with a key scoped to the user's public key to ensure
 * operations are isolated per account.
 */

import { useAuth } from "./auth-store";

const STORAGE_KEY_PREFIX = "mergepay_anchor_ops_";

/**
 * Non-sensitive data we persist for an anchor operation.
 */
export interface PersistedAnchorOperation {
  /** The session ID from the API */
  sessionId: string;
  /** The anchor name */
  anchorName: string;
  /** The operation kind (deposit/withdrawal) */
  kind: "deposit" | "withdrawal";
  /** The asset code */
  assetCode: string;
  /** Timestamp when the operation was started */
  startedAt: string;
}

/**
 * Get the storage key for the current user's anchor operations.
 * Returns null if no user is authenticated.
 */
function getStorageKey(): string | null {
  const user = useAuth.getState().user;
  if (!user?.stellarPublicKey) return null;
  return `${STORAGE_KEY_PREFIX}${user.stellarPublicKey}`;
}

/**
 * Save an anchor operation to persistence.
 * Only stores non-sensitive identifiers.
 */
export function saveAnchorOperation(operation: PersistedAnchorOperation): void {
  const key = getStorageKey();
  if (!key) return;

  try {
    const existing = loadAnchorOperations();
    // Update or add the operation
    const updated = existing.filter((op) => op.sessionId !== operation.sessionId);
    updated.push(operation);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (error) {
    // Silently fail on storage errors (e.g., quota exceeded)
    if (process.env.NODE_ENV !== "production") {
      console.warn("[anchor-persistence] Failed to save operation:", error);
    }
  }
}

/**
 * Load all persisted anchor operations for the current user.
 */
export function loadAnchorOperations(): PersistedAnchorOperation[] {
  const key = getStorageKey();
  if (!key) return [];

  try {
    const data = localStorage.getItem(key);
    if (!data) return [];
    const parsed = JSON.parse(data) as PersistedAnchorOperation[];
    // Validate the shape
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (op): op is PersistedAnchorOperation =>
        typeof op.sessionId === "string" &&
        typeof op.anchorName === "string" &&
        (op.kind === "deposit" || op.kind === "withdrawal") &&
        typeof op.assetCode === "string" &&
        typeof op.startedAt === "string"
    );
  } catch (error) {
    // Corrupted data - clear it
    if (process.env.NODE_ENV !== "production") {
      console.warn("[anchor-persistence] Failed to load operations:", error);
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
    return [];
  }
}

/**
 * Remove a specific anchor operation from persistence.
 */
export function removeAnchorOperation(sessionId: string): void {
  const key = getStorageKey();
  if (!key) return;

  try {
    const existing = loadAnchorOperations();
    const filtered = existing.filter((op) => op.sessionId !== sessionId);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[anchor-persistence] Failed to remove operation:", error);
    }
  }
}

/**
 * Clear all anchor operations for the current user.
 * Called when the user signs out.
 */
export function clearAnchorOperations(): void {
  const key = getStorageKey();
  if (!key) return;

  try {
    localStorage.removeItem(key);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[anchor-persistence] Failed to clear operations:", error);
    }
  }
}

/**
 * Clean up old operations (older than 24 hours) to prevent storage bloat.
 */
export function cleanupOldOperations(): void {
  const key = getStorageKey();
  if (!key) return;

  try {
    const existing = loadAnchorOperations();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const filtered = existing.filter((op) => {
      const started = new Date(op.startedAt).getTime();
      return now - started < oneDayMs;
    });
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[anchor-persistence] Failed to cleanup operations:", error);
    }
  }
}
