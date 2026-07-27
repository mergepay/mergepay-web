import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  rateLimit,
  checkRateLimit,
  getClientIp,
  hashBearerToken,
  __resetRateLimitStore,
} from "../rateLimiter";

/**
 * Build a Request-like object with the small surface the rate limiter
 * actually uses (`request.headers.get`). Avoids relying on the global
 * `Request` constructor signature, which differs subtly between DOM,
 * undici, and platform types and can make the test file a typecheck
 * landmine.
 */
function mockRequest(headers: Record<string, string> = {}): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

describe("getClientIp", () => {
  it("returns the first x-forwarded-for entry", () => {
    const req = mockRequest({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    assert.equal(getClientIp(req), "1.2.3.4");
  });

  it("trims whitespace", () => {
    const req = mockRequest({ "x-forwarded-for": "  5.6.7.8  " });
    assert.equal(getClientIp(req), "5.6.7.8");
  });

  it("falls back to x-real-ip", () => {
    const req = mockRequest({ "x-real-ip": "9.9.9.9" });
    assert.equal(getClientIp(req), "9.9.9.9");
  });

  it("returns 'unknown' when no IP headers are set", () => {
    assert.equal(getClientIp(mockRequest()), "unknown");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimitStore());

  it("allows requests under the limit", () => {
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit("k", 3, 1000, 0);
      assert.equal(r.ok, true);
    }
  });

  it("blocks once the limit is hit", () => {
    checkRateLimit("k", 3, 1000, 0);
    checkRateLimit("k", 3, 1000, 100);
    checkRateLimit("k", 3, 1000, 200);
    const blocked = checkRateLimit("k", 3, 1000, 300);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterMs > 0);
  });

  it("isolates buckets per key", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("a", 3, 1000, 0);
    const blockedA = checkRateLimit("a", 3, 1000, 300);
    const okB = checkRateLimit("b", 3, 1000, 300);
    assert.equal(blockedA.ok, false);
    assert.equal(okB.ok, true);
  });

  it("lazily drops stale entries outside the window", () => {
    checkRateLimit("k", 2, 1000, 0);
    checkRateLimit("k", 2, 1000, 100);
    // 1100ms later — the entry at t=0 is now stale.
    const r = checkRateLimit("k", 2, 1000, 1100);
    assert.equal(r.ok, true);
    assert.equal(r.remaining, 1);
  });

  it("reports retryAfterMs as time until oldest entry exits the window", () => {
    checkRateLimit("k", 1, 1000, 0);
    const blocked = checkRateLimit("k", 1, 1000, 500);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.retryAfterMs, 500);
  });
});

describe("hashBearerToken", () => {
  it("is deterministic for the same token", () => {
    assert.equal(hashBearerToken("abc"), hashBearerToken("abc"));
  });

  it("produces distinct keys for distinct tokens", () => {
    assert.notEqual(hashBearerToken("token-a"), hashBearerToken("token-b"));
  });

  it("treats tokens that share a 32-char prefix as distinct", () => {
    // The previous fallback (token.slice(0, 32)) collapsed these
    // into the same bucket, letting callers evade the limit. The
    // full-token hash must keep them apart.
    const a = "aaaaaaaaaaaaaaaa" + "-rest-of-a";
    const b = "aaaaaaaaaaaaaaaa" + "-rest-of-b";
    assert.notEqual(hashBearerToken(a), hashBearerToken(b));
  });

  it("prefixes the result so it cannot collide with other key shapes", () => {
    assert.ok(hashBearerToken("123").startsWith("tok:"));
  });

  it("hashes to a fixed 64-char hex digest", () => {
    const suffix = hashBearerToken("any").slice("tok:".length);
    assert.equal(suffix.length, 64);
    assert.match(suffix, /^[0-9a-f]{64}$/);
  });
});

describe("rateLimit middleware", () => {
  beforeEach(() => __resetRateLimitStore());

  it("passes through to the handler when under the limit", async () => {
    const handler = async (): Promise<Response> =>
      new Response("ok", { status: 200 });
    const wrapped = rateLimit(
      {
        limit: 5,
        windowMs: 1000,
        keyFn: (req) => req.headers.get("x-test"),
      },
      handler
    );

    const req = mockRequest({ "x-test": "abc" });
    const res = await wrapped(req);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
    assert.equal(res.headers.get("X-RateLimit-Limit"), "5");
    assert.equal(res.headers.get("X-RateLimit-Remaining"), "4");
  });

  it("returns 429 with Retry-After when limit exceeded", async () => {
    const handler = async (): Promise<Response> =>
      new Response("ok", { status: 200 });
    const wrapped = rateLimit(
      {
        limit: 2,
        windowMs: 1000,
        keyFn: (req) => req.headers.get("x-test"),
      },
      handler
    );
    const req = mockRequest({ "x-test": "abc" });

    await wrapped(req);
    await wrapped(req);
    const blocked = await wrapped(req);

    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("Retry-After"));
    assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
    assert.equal(blocked.headers.get("X-RateLimit-Remaining"), "0");
    const body = (await blocked.json()) as Record<string, unknown>;
    assert.equal(body.error, "Too many requests. Please slow down.");
    assert.equal(body.code, "RATE_LIMITED");
  });

  it("bypasses rate limiting when keyFn returns null", async () => {
    const handler = async (): Promise<Response> => new Response("ok");
    const wrapped = rateLimit(
      { limit: 1, windowMs: 1000, keyFn: () => null },
      handler
    );
    await wrapped(mockRequest());
    const res = await wrapped(mockRequest());
    assert.equal(res.status, 200);
  });

  it("counts every attempt, including downstream failures", async () => {
    const handler = async (): Promise<Response> =>
      new Response("boom", { status: 500 });
    const wrapped = rateLimit(
      {
        limit: 2,
        windowMs: 1000,
        keyFn: (req) => req.headers.get("x-test"),
      },
      handler
    );
    const req = mockRequest({ "x-test": "abc" });
    await wrapped(req);
    await wrapped(req);
    const blocked = await wrapped(req);
    assert.equal(blocked.status, 429);
  });
});
