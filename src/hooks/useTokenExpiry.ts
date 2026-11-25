"use client";

/**
 * Proactive session-expiry watcher (#393).
 *
 * Decodes the in-memory JWT's `exp` claim and schedules an auto-logout just
 * before the token expires — plus an early, non-intrusive `sonner`
 * notification prompting the user to re-authenticate. This is the complement
 * to the reactive 401 handler in `./api.ts`: it ends the session and wipes
 * state even when the app makes no network calls, so a stale token can never
 * linger.
 *
 * The timeout is rescheduled whenever the token changes and torn down on
 * unmount / logout, so there is exactly one pending timer at a time.
 */

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import {
  classifyTokenExpiry,
  untilTokenExpiryDelta,
  type TokenExpiryState,
} from "@/lib/sessionExpiry";

/** Options for the expiry watcher. */
export interface TokenExpiryOptions {
  /** Advance warning (ms) before expiry to classify the token as "expiring". */
  warningMs?: number;
  /** Extra safety margin (ms) — tokens within this of exp are "expired". */
  graceMs?: number;
  /** Called when the session should end (defaults to the store's logout). */
  onExpire?: () => void | Promise<void>;
  /** Clock (ms since epoch), for tests. */
  now?: number;
}

/** Milliseconds before expiry at which the "please sign in again" toast fires. */
export const EXPIRE_TOAST_LEAD_MS = 30 * 1000;

/**
 * Watch the in-memory JWT and end the session as it expires. Returns the
 * current classified expiry state so a caller can reflect "expiring" in UI.
 */
export function useTokenExpiry(opts: TokenExpiryOptions = {}) {
  const token = useAuth((s) => s.token);
  // Keep the latest callback without re-subscribing the timer on every render.
  const onExpireRef = useRef(opts.onExpire);
  onExpireRef.current = opts.onExpire;

  const { warningMs, graceMs, now } = opts;
  const expiry = useMemo(
    () => classifyTokenExpiry(token, { warningMs, graceMs, now }),
    [token, warningMs, graceMs, now]
  );

  useEffect(() => {
    if (!token) return;
    const { state, msUntilExpiry } = classifyTokenExpiry(token, {
      warningMs,
      graceMs,
      now,
    });

    if (state === "none" || state === "unknown") return;

    // Fire the (default) logout; wrap so a consumer error never crashes.
    const fire = () => {
      void Promise.resolve(onExpireRef.current?.()).catch(() => {});
    };

    if (state === "expired") {
      fire();
      return;
    }

    const timers: number[] = [];

    // Early heads-up toast, a little before the hard logout.
    const leadMs = Math.max(0, (msUntilExpiry ?? 0) - EXPIRE_TOAST_LEAD_MS);
    if (leadMs > 0) {
      timers.push(
        window.setTimeout(() => {
          toast.info("Your session is expiring soon", {
            description:
              "Reconnect your Freighter wallet to stay signed in.",
          });
        }, leadMs)
      );
    }

    // Hard logout at expiry (bounded to the safe timer ceiling).
    const { delayMs } = untilTokenExpiryDelta(token, { warningMs, graceMs, now });
    if (delayMs !== null) {
      timers.push(window.setTimeout(fire, delayMs));
    }

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [token, warningMs, graceMs, now]);

  return { state: expiry.state as TokenExpiryState, exp: expiry.exp };
}