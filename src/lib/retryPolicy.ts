/**
 * Retry policy for network reads against Stellar Horizon and mergepay-api
 * (#900).
 *
 * Temporary glitches — a dropped connection, a request timeout, a Horizon
 * rate limit, a 502 from a load balancer mid-deploy — should heal on their
 * own without the user seeing an error. Deterministic failures should not be
 * retried at all: a 400/404/422 will answer the same way every time, and
 * retrying it only delays the error the user needs to see.
 *
 * Everything here is pure (no React, no React Query import) so the policy is
 * unit-testable with plain inputs and shared by the global `QueryClient`
 * defaults and any hook that needs to apply the same rules.
 */

/** Maximum automatic retries for a transient failure (4 attempts in total). */
export const MAX_TRANSIENT_RETRIES = 3;

/** Delay before the first retry; each later retry doubles it. */
export const BASE_RETRY_DELAY_MS = 1_000;

/** Upper bound for a single backoff wait, Retry-After included. */
export const MAX_RETRY_DELAY_MS = 30_000;

/**
 * HTTP statuses that are worth retrying even though they are not 5xx:
 * 408 Request Timeout and 429 Too Many Requests (Horizon's rate limit).
 */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

/**
 * A non-2xx HTTP response from a third-party endpoint (CoinGecko, an anchor,
 * a raw `fetch` to Horizon). mergepay-api failures already arrive as
 * `ApiRequestError`, which carries the same `status` field.
 */
export class HttpStatusError extends Error {
  readonly status: number;
  /** Seconds from a `Retry-After` header, when the server sent one. */
  readonly retryAfterSeconds: number | null;

  constructor(status: number, message?: string, retryAfterSeconds: number | null = null) {
    super(message ?? `Request failed with status ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Read an HTTP status from any of the error shapes the app sees:
 *  - `ApiRequestError` / `HttpStatusError` — `error.status`
 *  - `@stellar/stellar-sdk` Horizon errors (`NetworkError`, `NotFoundError`,
 *    `BadResponseError`) — `error.response.status`
 *  - axios-style errors — `error.response.status`
 *
 * Returns `null` when no status is known (e.g. a `TypeError` from `fetch`).
 * A status of `0` means the request never reached the server.
 */
export function getErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const direct = asStatus(error.status);
  if (direct !== null) return direct;
  if (isRecord(error.response)) {
    const nested = asStatus(error.response.status);
    if (nested !== null) return nested;
  }
  return null;
}

/**
 * Whether the error is a network-level failure (no HTTP response at all):
 * offline, DNS, CORS, connection reset, or an aborted/timed-out request.
 */
export function isNetworkError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const name = typeof error.name === "string" ? error.name : "";
  // `AbortSignal.timeout` rejects with a TimeoutError DOMException.
  if (name === "TimeoutError" || name === "NetworkError") return true;
  // `fetch` rejects with a TypeError on network failure, but so does a plain
  // programming bug — so a TypeError only counts when its message is one of
  // the browsers'/Node's network-failure messages.
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return /network ?error|failed to fetch|fetch failed|load failed|timed? ?out|econnreset|econnrefused|enotfound|socket hang up/.test(
    message
  );
}

/**
 * Whether a failure is transient — i.e. the same request might succeed if it
 * is sent again shortly.
 *
 *  - 5xx, 408 and 429 → transient
 *  - any other 4xx   → deterministic, fail fast
 *  - status 0 or a network-level error with no status → transient
 *  - a schema/validation error (named `ApiValidationError`) → deterministic
 *  - anything else unclassified → not retried, so programming errors surface
 */
export function isTransientError(error: unknown): boolean {
  if (isRecord(error) && error.name === "ApiValidationError") return false;

  const status = getErrorStatus(error);
  if (status !== null) {
    if (status === 0) return true;
    if (status >= 500 && status <= 599) return true;
    return RETRYABLE_CLIENT_STATUSES.has(status);
  }
  return isNetworkError(error);
}

export interface RetryPolicyOptions {
  /** Maximum retries for a transient error. Defaults to {@link MAX_TRANSIENT_RETRIES}. */
  maxRetries?: number;
  /** Reports whether the device is online. Defaults to `navigator.onLine`. */
  isOnline?: () => boolean;
}

function defaultIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * React Query compatible `retry` predicate.
 *
 * `failureCount` is the number of failures so far *before* this decision —
 * React Query passes 0 after the first failure — so `failureCount <
 * maxRetries` allows exactly `maxRetries` retries.
 */
export function shouldRetryRequest(
  failureCount: number,
  error: unknown,
  options: RetryPolicyOptions = {}
): boolean {
  const maxRetries = options.maxRetries ?? MAX_TRANSIENT_RETRIES;
  const isOnline = options.isOnline ?? defaultIsOnline;
  // Retrying while offline cannot succeed; `networkMode: "offlineFirst"`
  // resumes the query when connectivity returns.
  if (!isOnline()) return false;
  if (failureCount >= maxRetries) return false;
  return isTransientError(error);
}

/** Seconds a server asked us to wait before retrying, when it said so. */
function retryAfterMs(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const seconds = error.retryAfterSeconds;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return null;
}

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * Fraction of the delay (0–1) to randomise, spreading retries from many
   * clients so they do not hit a recovering Horizon node in lockstep.
   * Defaults to 0 (deterministic).
   */
  jitter?: number;
  /** Random source in [0, 1); injectable for tests. */
  random?: () => number;
}

/**
 * Exponential backoff: `base * 2^attempt`, capped at `maxDelayMs`.
 *
 * `attempt` is React Query's `failureCount` (0 for the first retry), giving
 * 1s → 2s → 4s with the defaults. A `Retry-After` from the server wins when
 * it is longer than the computed delay (still capped).
 */
export function retryDelayWithBackoff(
  attempt: number,
  error?: unknown,
  options: BackoffOptions = {}
): number {
  const base = options.baseDelayMs ?? BASE_RETRY_DELAY_MS;
  const max = options.maxDelayMs ?? MAX_RETRY_DELAY_MS;
  const jitter = Math.min(1, Math.max(0, options.jitter ?? 0));
  const random = options.random ?? Math.random;

  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  let delay = Math.min(max, base * 2 ** safeAttempt);

  if (jitter > 0) {
    // Subtract up to `jitter` of the delay so the cap is never exceeded.
    delay -= delay * jitter * random();
  }

  const serverHint = retryAfterMs(error);
  if (serverHint !== null && serverHint > delay) {
    delay = Math.min(max, serverHint);
  }

  return Math.round(delay);
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into seconds. */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}
