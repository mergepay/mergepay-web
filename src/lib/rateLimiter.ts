import { createHash } from "node:crypto";
import { apiError, COMMON_CODES } from "./apiHelpers";

/**
 * The shape a route handler must conform to so that `rateLimit` can
 * wrap it. `Request` is the first parameter (matches the Next.js
 * App Router signature).
 */
export type Handler<Extra extends unknown[] = []> = (
  request: Request,
  ...extra: Extra
) => Promise<Response>;

/**
 * Sliding-window log of request timestamps per key.
 *
 * Memory is bounded by `limit * active_keys`: stale entries are
 * removed lazily on every `checkRateLimit` call for the hot keys,
 * and a periodic sweep reaps keys that go cold. Both paths share the
 * same cutoff so a key never appears partly-trimmed.
 */
const store = new Map<string, number[]>();

/** How often the background sweep runs (also the cutoff it applies). */
const SWEEP_INTERVAL_MS = 60_000;

/** Single-flight guard so multiple module loads don't open multiple timers. */
let sweepScheduled = false;

/**
 * Lazily start a 60-second background sweep. The timer is `unref`ed
 * so it never keeps the Node process alive on its own. Lazy init
 * means no timer overhead when the module is loaded for tests or
 * utility usage that never hits `checkRateLimit`.
 */
function ensureSweep(): void {
  if (sweepScheduled) return;
  sweepScheduled = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, history] of store) {
      const cutoff = now - SWEEP_INTERVAL_MS;
      const fresh: number[] = [];
      for (const t of history) {
        if (t > cutoff) fresh.push(t);
      }
      if (fresh.length === 0) {
        store.delete(key);
      } else {
        store.set(key, fresh);
      }
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the Node process alive solely for the sweep.
  type MaybeUnref = { unref?: () => void };
  const t = timer as MaybeUnref;
  if (typeof t.unref === "function") t.unref();
}

/**
 * Extract the client IP from common reverse-proxy headers. Falls back
 * to the literal `"unknown"` so unmatched requests share one bucket —
 * better than silently bypassing the limit.
 *
 * The first hop of `x-forwarded-for` is taken (the original client);
 * intermediate proxy addresses that some load balancers append are
 * ignored.
 */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Derive a stable, opaque bucket key from a bearer token.
 *
 * Why hash the full token rather than decode the JWT subject?
 * - The BFF does not hold a JWT verification secret; decoding claims
 *   without verification is unsafe because a caller can forge any
 *   subject.
 * - Truncating the token (a previous fallback) lets a caller generate
 *   arbitrarily many distinct keys by varying inputs, so the limit
 *   was trivially evadable.
 * - A SHA-256 of the full token uniquely identifies the credential
 *   that authenticated the request. The upstream API remains the
 *   source of truth for identity; this helper only segments buckets.
 *
 * Returns a prefixed string so collision with `getClientIp`-style
 * keys (e.g. IPv4 strings) is impossible even if a future caller
 * passes one through this function by mistake.
 */
export function hashBearerToken(token: string): string {
  return `tok:${createHash("sha256").update(token).digest("hex")}`;
}

export interface RateLimitOptions {
  /** Maximum requests allowed inside `windowMs`. */
  limit: number;
  /** Sliding window size in milliseconds. */
  windowMs: number;
  /**
   * Resolve the bucket key from the incoming request. Return `null`
   * (or `undefined`) to bypass rate limiting entirely for that
   * request — useful for routes that only limit authenticated callers.
   */
  keyFn: (request: Request) => string | null | Promise<string | null>;
}

export interface RateLimitResult {
  ok: boolean;
  /** Remaining requests in the current window after this call. */
  remaining: number;
  /** Milliseconds until the bucket regains capacity. 0 when not blocked. */
  retryAfterMs: number;
}

/**
 * Core rate-limit check. Pure-ish: relies only on the module-level
 * store and an injectable clock so tests can advance time
 * deterministically. Side-effect: triggers the background sweep
 * scheduler on the first call.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  ensureSweep();
  const cutoff = now - windowMs;
  const history = store.get(key) ?? [];
  // Lazy cleanup — drop entries outside the window before deciding.
  const fresh: number[] = [];
  for (const t of history) {
    if (t > cutoff) fresh.push(t);
  }
  if (fresh.length >= limit) {
    // The oldest entry determines when capacity returns.
    const oldest: number = fresh[0]!;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    store.set(key, fresh);
    return { ok: false, remaining: 0, retryAfterMs };
  }
  fresh.push(now);
  store.set(key, fresh);
  return {
    ok: true,
    remaining: limit - fresh.length,
    retryAfterMs: 0,
  };
}

/**
 * Wrap a Next.js Route Handler in a rate limit.
 *
 * Every call counts toward the limit — including ones that fail
 * downstream. Limiting only successes would let an attacker retry
 * forever on every 4xx.
 */
export function rateLimit<Extra extends unknown[] = []>(
  options: RateLimitOptions,
  handler: Handler<Extra>
): Handler<Extra> {
  const wrapped: Handler<Extra> = async (request, ...extra) => {
    const resolved = await options.keyFn(request);
    if (resolved === null || resolved === undefined) {
      return handler(request, ...extra);
    }
    const result = checkRateLimit(resolved, options.limit, options.windowMs);
    if (!result.ok) {
      const retryAfterSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      const res = apiError(
        429,
        "Too many requests. Please slow down.",
        COMMON_CODES.RATE_LIMITED,
        { retryAfterMs: result.retryAfterMs }
      );
      res.headers.set("Retry-After", String(retryAfterSec));
      res.headers.set("X-RateLimit-Limit", String(options.limit));
      res.headers.set("X-RateLimit-Remaining", "0");
      return res;
    }
    const response = await handler(request, ...extra);
    response.headers.set("X-RateLimit-Limit", String(options.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    return response;
  };
  return wrapped;
}

/** Test-only: clear the in-memory store between unit tests. */
export function __resetRateLimitStore(): void {
  store.clear();
}

/** Test-only: peek the timestamps currently held for a key. */
export function __getRateLimitEntries(key: string): number[] {
  const entries = store.get(key);
  return entries ? [...entries] : [];
}
