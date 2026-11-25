/**
 * Proactive session-expiry helpers (#393).
 *
 * The API client already reacts to a 401 by clearing the store (see
 * `src/lib/api.ts`). This module adds the *proactive* half: it decodes the
 * `exp` claim from the in-memory JWT and decides how close the session is to
 * expiring — so the app can sign out / prompt re-auth *before* the token is
 * actually rejected, rather than waiting for a 401.
 *
 * Everything here is pure and testable without a browser.
 */

/** The claims we read off the JWT payload. Everything else is ignored. */
export interface JwtClaims {
  /** Seconds since the Unix epoch at which the token is no longer valid. */
  exp?: number;
  /** Optional issuer / account, useful for diagnostics. */
  sub?: string;
}

export type TokenExpiryState =
  /** No token present — nothing to schedule. */
  | "none"
  /** The token has no parseable `exp`; expiry cannot be predicted. */
  | "unknown"
  /** The token is already expired (or expires within `graceMs`). */
  | "expired"
  /** The token will expire soon (within `warningMs`). */
  | "expiring"
  /** The token is comfortably valid. */
  | "valid";

/** Options controlling the expiry thresholds. */
export interface TokenExpiryOptions {
  /** Clock, injected for tests. */
  now?: number;
  /** How long in advance (ms) to treat a token as "expiring". */
  warningMs?: number;
  /** Extra safety margin (ms): treat tokens within this of exp as expired. */
  graceMs?: number;
}

const DEFAULT_WARNING_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_GRACE_MS = 5 * 1000; // 5 seconds

/**
 * Decode the payload of a JWT (base64url, no signature verification — this is
 * only used to read the *already-decided* expiry, never to authenticate).
 *
 * Returns an empty object for malformed / non-JWT strings so callers can
 * treat unparseable tokens as "unknown" rather than throwing at runtime.
 */
export function decodeJwt(token: string): JwtClaims {
  if (!token) return {};
  const parts = token.split(".");
  // A JWT has three dot-separated segments; accept anything with at least a
  // payload (segment 2). Defensive: leave on EOF immediately.
  if (parts.length < 2) return {};
  try {
    const payload = parts[1];
    // base64url → base64: swap url chars and restore padding.
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    let json: string;
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      json = window.atob(padded);
    } else {
      // Non-browser runtime (Node): use Buffer if available.
      const { Buffer } = globalThis as unknown as { Buffer?: { from(b: string, e: string): { toString(e: string): string } } };
      if (!Buffer) return {};
      json = Buffer.from(padded, "base64").toString("utf-8");
    }
    const parsed = JSON.parse(json) as JwtClaims;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Classify how close to expiry a token is, given the current clock.
 *
 * @param token   The raw JWT (or empty/nullable string).
 * @param options Optional thresholds / clock.
 * @returns       A {@link TokenExpiryState} plus the decoded expiry timestamp.
 */
export function classifyTokenExpiry(
  token: string | null | undefined,
  options: TokenExpiryOptions = {}
): { state: TokenExpiryState; exp: number | null; msUntilExpiry: number | null } {
  if (!token) return { state: "none", exp: null, msUntilExpiry: null };

  const claims = decodeJwt(token);
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    return { state: "unknown", exp: null, msUntilExpiry: null };
  }

  const now = options.now ?? Date.now();
  const warningMs = options.warningMs ?? DEFAULT_WARNING_MS;
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const expMs = claims.exp * 1000;
  const msUntilExpiry = expMs - now;

  let state: TokenExpiryState;
  if (msUntilExpiry <= graceMs) {
    state = "expired";
  } else if (msUntilExpiry <= warningMs) {
    state = "expiring";
  } else {
    state = "valid";
  }

  return { state, exp: claims.exp, msUntilExpiry };
}

/**
 * How long to wait (ms) before the app should act on a token, or `null` to
 * act immediately. Returns a bounded delay so a far-future `exp` does not
 * schedule a setTimeout beyond the safe 2^31-1 ms ceiling.
 */
export function untilTokenExpiryDelta(
  token: string | null | undefined,
  options: TokenExpiryOptions = {}
): { delayMs: number | null; state: TokenExpiryState } {
  const { state, msUntilExpiry } = classifyTokenExpiry(token, options);
  if (state === "none" || state === "unknown") return { delayMs: null, state };
  if (state === "expired") return { delayMs: 0, state };
  // Schedule slightly *before* expiry so the toast fires while the session
  // is still barely usable, then clear on the next tick.
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const delayMs = Math.max(0, Math.min(msUntilExpiry! - graceMs, 2 ** 31 - 1));
  return { delayMs, state };
}