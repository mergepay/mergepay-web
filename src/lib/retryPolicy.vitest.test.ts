import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  BASE_RETRY_DELAY_MS,
  HttpStatusError,
  MAX_RETRY_DELAY_MS,
  MAX_TRANSIENT_RETRIES,
  getErrorStatus,
  isTransientError,
  parseRetryAfter,
  retryDelayWithBackoff,
  shouldRetryRequest,
} from "./retryPolicy";
import { ApiRequestError, ApiValidationError } from "./errorHandler";
import {
  DEFAULT_RETRY_COUNT,
  createQueryClient,
  queryRetry,
  queryRetryDelay,
} from "./queryClient";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const online = () => true;

/** Shape of a `@stellar/stellar-sdk` Horizon error (`NetworkError` & co). */
function horizonError(status: number) {
  const error = new Error(`Horizon responded ${status}`) as Error & {
    response: { status: number };
  };
  error.name = "NetworkError";
  error.response = { status };
  return error;
}

describe("error classification", () => {
  it("reads the status from API, HTTP and Horizon error shapes", () => {
    expect(getErrorStatus(new ApiRequestError(503, "x", "down"))).toBe(503);
    expect(getErrorStatus(new HttpStatusError(429))).toBe(429);
    expect(getErrorStatus(horizonError(504))).toBe(504);
    expect(getErrorStatus(new Error("plain"))).toBeNull();
    expect(getErrorStatus(null)).toBeNull();
  });

  it.each([500, 502, 503, 504, 408, 429, 0])("treats status %i as transient", (status) => {
    expect(isTransientError(new ApiRequestError(status, "e", "e"))).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 410, 422])("treats status %i as a client error", (status) => {
    expect(isTransientError(new ApiRequestError(status, "e", "e"))).toBe(false);
    expect(isTransientError(horizonError(status))).toBe(false);
  });

  it("treats fetch network failures and timeouts as transient", () => {
    expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientError(new TypeError("fetch failed"))).toBe(true);
    const timeout = new Error("signal timed out");
    timeout.name = "TimeoutError";
    expect(isTransientError(timeout)).toBe(true);
  });

  it("does not retry programming errors or schema validation errors", () => {
    expect(isTransientError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isTransientError(new ApiValidationError())).toBe(false);
    expect(isTransientError(new Error("boom"))).toBe(false);
  });
});

describe("shouldRetryRequest", () => {
  it("allows up to 3 retries for a transient failure", () => {
    const error = new ApiRequestError(503, "unavailable", "down");
    const decisions = [0, 1, 2, 3, 4].map((n) =>
      shouldRetryRequest(n, error, { isOnline: online })
    );
    expect(decisions).toEqual([true, true, true, false, false]);
    expect(MAX_TRANSIENT_RETRIES).toBe(3);
  });

  it("fails fast on 4xx", () => {
    expect(shouldRetryRequest(0, new ApiRequestError(404, "nf", "nf"), { isOnline: online })).toBe(false);
    expect(shouldRetryRequest(0, horizonError(400), { isOnline: online })).toBe(false);
  });

  it("never retries while offline", () => {
    expect(
      shouldRetryRequest(0, new ApiRequestError(503, "x", "x"), { isOnline: () => false })
    ).toBe(false);
  });
});

describe("retryDelayWithBackoff", () => {
  it("doubles the delay on each attempt", () => {
    expect([0, 1, 2, 3].map((n) => retryDelayWithBackoff(n))).toEqual([
      BASE_RETRY_DELAY_MS,
      BASE_RETRY_DELAY_MS * 2,
      BASE_RETRY_DELAY_MS * 4,
      BASE_RETRY_DELAY_MS * 8,
    ]);
  });

  it("caps the delay", () => {
    expect(retryDelayWithBackoff(20)).toBe(MAX_RETRY_DELAY_MS);
    expect(retryDelayWithBackoff(3, undefined, { maxDelayMs: 5_000 })).toBe(5_000);
  });

  it("applies jitter below the computed delay only", () => {
    expect(retryDelayWithBackoff(2, undefined, { jitter: 0.5, random: () => 0 })).toBe(4_000);
    expect(retryDelayWithBackoff(2, undefined, { jitter: 0.5, random: () => 0.999999 })).toBe(2_000);
  });

  it("honours a longer Retry-After hint, capped", () => {
    expect(retryDelayWithBackoff(0, new HttpStatusError(429, "slow down", 5))).toBe(5_000);
    expect(retryDelayWithBackoff(0, new HttpStatusError(429, "slow down", 600))).toBe(MAX_RETRY_DELAY_MS);
  });

  it("guards against nonsensical attempts", () => {
    expect(retryDelayWithBackoff(-1)).toBe(BASE_RETRY_DELAY_MS);
    expect(retryDelayWithBackoff(Number.NaN)).toBe(BASE_RETRY_DELAY_MS);
  });

  it("parses Retry-After headers", () => {
    expect(parseRetryAfter("7")).toBe(7);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("garbage")).toBeNull();
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10);
  });
});

describe("global QueryClient configuration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("installs the custom retry and exponential retryDelay", () => {
    const defaults = createQueryClient().getDefaultOptions().queries;
    expect(defaults?.retry).toBe(queryRetry);
    expect(defaults?.retryDelay).toBe(queryRetryDelay);
    expect(DEFAULT_RETRY_COUNT).toBe(3);
  });

  it("does not retry mutations, which may not be idempotent", () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("increases the global delay between retries", () => {
    const delays = [0, 1, 2].map((n) => queryRetryDelay(n, new Error("x")));
    expect(delays[0]).toBeLessThanOrEqual(1_000);
    expect(delays[1]).toBeGreaterThan(1_000 * 0.8 - 1);
    expect(delays[2]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeLessThanOrEqual(4_000);
  });

  async function runQuery(queryFn: () => Promise<unknown>) {
    vi.useFakeTimers();
    const client = createQueryClient();
    const observer = new QueryObserver(client, { queryKey: ["retry-test"], queryFn });
    const settled = new Promise<void>((resolve) => {
      const unsubscribe = observer.subscribe((result) => {
        if (result.status !== "pending" && result.fetchStatus === "idle") {
          unsubscribe();
          resolve();
        }
      });
    });
    // Drain backoff timers (1s + 2s + 4s, minus jitter) without waiting.
    await vi.advanceTimersByTimeAsync(60_000);
    await settled;
    return client;
  }

  it("retries a simulated Horizon 503 three times, then surfaces the error", async () => {
    const queryFn = vi.fn().mockRejectedValue(horizonError(503));
    const client: QueryClient = await runQuery(queryFn);
    expect(queryFn).toHaveBeenCalledTimes(1 + 3);
    expect(client.getQueryState(["retry-test"])?.status).toBe("error");
  });

  it("recovers when a transient network failure clears", async () => {
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new ApiRequestError(502, "bad_gateway", "x"))
      .mockResolvedValue({ ok: true });
    const client = await runQuery(queryFn);
    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(client.getQueryData(["retry-test"])).toEqual({ ok: true });
  });

  it("fails fast on a 4xx without retrying", async () => {
    const queryFn = vi.fn().mockRejectedValue(new ApiRequestError(404, "not_found", "x"));
    await runQuery(queryFn);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
