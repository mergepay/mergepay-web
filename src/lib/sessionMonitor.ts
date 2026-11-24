/**
 * Central session-expiry monitor (#898).
 *
 * The API client already knows *when* a request was rejected with `401`; the
 * rest of the app needs to agree on *what to do about it*. Before this module
 * that cleanup lived inline in `src/lib/api.ts` and only cleared the auth
 * store, so a group selection and the active asset survived a dead session and
 * a subsequent account could inherit them.
 *
 * This module is deliberately free of React: it reaches the Zustand stores
 * through `getState()` and announces the expiry with a DOM event, which keeps
 * the API layer independent of any component tree. The event is what lets
 * surfaces such as the toast host react to an expiry without importing the
 * client (which would be a cycle).
 */

import { useAssetStore } from "./asset-store";
import { useAuth } from "./auth-store";
import { useGroupStore } from "./group-store";

/** Fired on `window` whenever the client session is torn down. */
export const SESSION_EXPIRED_EVENT = "mergepay:session-expired";

/** Why the session ended — used for telemetry and copy, never for auth. */
export type SessionExpiredReason = "unauthorized" | "token_expired" | "idle_timeout";

export interface SessionExpiredDetail {
  reason: SessionExpiredReason;
}

/** Whether an HTTP status means the bearer token is no longer accepted. */
export function isUnauthorizedStatus(status: number): boolean {
  return status === 401;
}

/**
 * Wipe every piece of client state that belongs to the authenticated account.
 *
 * Order matters only in that the auth store goes first: it is the source of
 * truth for "is anyone signed in", and clearing it stops the rest of the app
 * from re-rendering against account data while the other stores are reset.
 *
 * `forgetWallet()` (rather than `clear()`) is intentional. It also drops the
 * persisted wallet identity and `lastAuthenticatedAt`, so a reload cannot
 * resume the dead session from `localStorage`; the persisted bearer token was
 * never stored in the first place. The group and asset stores persist their
 * own preferences, so their reset methods write the cleared state back
 * through zustand's persist middleware.
 */
export function clearClientSession(): void {
  useAuth.getState().forgetWallet();
  useGroupStore.getState().clear();
  useAssetStore.getState().resetActiveAsset();
}

/**
 * Announce a session expiry to any mounted listener.
 *
 * A custom event (instead of a module-level callback registry) keeps this
 * helper usable from non-React code such as the fetch wrapper, while allowing
 * the provider tree to subscribe and own user-facing side effects like
 * clearing the React Query cache or showing a toast.
 */
export function emitSessionExpired(reason: SessionExpiredReason): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<SessionExpiredDetail>(SESSION_EXPIRED_EVENT, {
      detail: { reason },
    })
  );
}

/**
 * Subscribe to session expiries. Returns an unsubscribe function so a React
 * effect can clean up on unmount.
 */
export function subscribeToSessionExpired(
  listener: (detail: SessionExpiredDetail) => void
): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<SessionExpiredDetail>).detail;
    listener(detail ?? { reason: "unauthorized" });
  };
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
}
