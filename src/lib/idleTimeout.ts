/**
 * Idle-session policy (#910).
 *
 * A shared, pure description of *when* a signed-in session has been idle long
 * enough to warn the user and when it must be locked. The browser wiring lives
 * in `src/hooks/useIdleSession.ts`; keeping the thresholds and the phase rules
 * here means the timer, the warning modal and the unit tests all agree on the
 * same numbers.
 *
 * Nothing in this module reads storage or touches Freighter: idle locking only
 * clears the app's cached session. Private keys never leave the wallet, so
 * there is nothing secret to erase here.
 */

/** Default inactivity before the session is locked: 15 minutes. */
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** How long before the lock the warning modal is shown: 1 minute. */
export const DEFAULT_IDLE_WARNING_MS = 60 * 1000;

/** How often the idle deadline is re-evaluated, in milliseconds. */
export const IDLE_CHECK_INTERVAL_MS = 1_000;

/**
 * Events that count as the user interacting with the page. Deliberately
 * passive listeners — observing activity must never interrupt typing, scrolling
 * or a drag.
 */
export const IDLE_ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
  "pointerdown",
] as const;

export type IdleActivityEvent = (typeof IDLE_ACTIVITY_EVENTS)[number];

export interface IdleTimeoutConfig {
  /** Total inactivity before the session is locked. */
  timeoutMs: number;
  /** How long before `timeoutMs` the warning phase starts. */
  warningMs: number;
}

/**
 * Normalise caller-supplied thresholds.
 *
 * Invalid / non-positive timeouts fall back to the default rather than
 * producing a timer that never fires. A warning longer than the timeout is
 * clamped so the warning can never start before the session begins.
 */
export function resolveIdleTimeoutConfig(
  overrides: Partial<IdleTimeoutConfig> = {}
): IdleTimeoutConfig {
  const timeout =
    typeof overrides.timeoutMs === "number" &&
    Number.isFinite(overrides.timeoutMs) &&
    overrides.timeoutMs > 0
      ? overrides.timeoutMs
      : DEFAULT_IDLE_TIMEOUT_MS;

  const warning =
    typeof overrides.warningMs === "number" &&
    Number.isFinite(overrides.warningMs) &&
    overrides.warningMs >= 0
      ? Math.min(overrides.warningMs, timeout)
      : Math.min(DEFAULT_IDLE_WARNING_MS, timeout);

  return { timeoutMs: timeout, warningMs: warning };
}

export type IdlePhase =
  /** The user is still within the active window. */
  | "active"
  /** The warning modal is due, but the session is still usable. */
  | "warning"
  /** The idle threshold has been reached and the session must be locked. */
  | "expired";

export interface IdleState {
  phase: IdlePhase;
  /** Milliseconds since the last observed interaction (never negative). */
  idleMs: number;
  /** Milliseconds until the session locks (0 once expired). */
  remainingMs: number;
}

/**
 * Classify the elapsed inactivity into a phase.
 *
 * A clock that moved backwards (or a timestamp from the future) yields
 * `idleMs = 0`, so a clock change can never force an immediate lock.
 */
export function evaluateIdleState(args: {
  lastActivityAt: number;
  now?: number;
  timeoutMs?: number;
  warningMs?: number;
}): IdleState {
  const { timeoutMs, warningMs } = resolveIdleTimeoutConfig({
    timeoutMs: args.timeoutMs,
    warningMs: args.warningMs,
  });
  const now = args.now ?? Date.now();
  const idleMs = Math.max(0, now - args.lastActivityAt);
  const remainingMs = Math.max(0, timeoutMs - idleMs);

  let phase: IdlePhase = "active";
  if (idleMs >= timeoutMs) {
    phase = "expired";
  } else if (idleMs >= timeoutMs - warningMs) {
    phase = "warning";
  }

  return { phase, idleMs, remainingMs };
}
