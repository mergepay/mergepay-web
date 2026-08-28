import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock next/server so tests run outside the Next.js build pipeline.
// The mock mirrors the real NextResponse.json signature (body + init).
// ---------------------------------------------------------------------------
vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      /** Expose body so tests can inspect it without calling .json(). */
      _body: data as Record<string, unknown>,
      /** HTTP status that would be sent to the client. */
      _status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// Vitest hoists vi.mock() calls above static imports, so the mock is already
// in place when this module is evaluated — no dynamic import needed.
import { GET } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockResponse = { _body: Record<string, unknown>; _status: number };

/** Shorthand: fetch resolves (any HTTP status) → probe returns "ok". */
const fetchOk = () => vi.fn().mockResolvedValue({ status: 200 });

/** Shorthand: fetch rejects (network/DNS error) → probe returns "degraded". */
const fetchFail = () => vi.fn().mockRejectedValue(new TypeError("fetch failed"));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/health", () => {
  const savedFetch = global.fetch;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Use deterministic test URLs so we can assert the right paths are probed.
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    process.env.NEXT_PUBLIC_HORIZON_URL = "http://horizon.test";
  });

  afterEach(() => {
    global.fetch = savedFetch;
    // Restore only the two vars we touch so other env vars aren't disturbed.
    process.env.NEXT_PUBLIC_API_URL = savedEnv.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_HORIZON_URL = savedEnv.NEXT_PUBLIC_HORIZON_URL;
    vi.restoreAllMocks();
  });

  // -- happy path ------------------------------------------------------------

  it("returns status 'ok' and HTTP 200 when both dependencies respond", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });

    const res = (await GET()) as unknown as MockResponse;
    const body = res._body;

    expect(res._status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.dependencies).toEqual({ api: "ok", stellar: "ok" });
  });

  it("includes numeric uptime and ISO timestamp", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });

    const before = new Date().toISOString();
    const res = (await GET()) as unknown as MockResponse;
    const after = new Date().toISOString();
    const body = res._body;

    expect(typeof body.uptime).toBe("number");
    expect((body.uptime as number) >= 0).toBe(true);
    expect(typeof body.timestamp).toBe("string");
    // Timestamp must fall between the two bookmarks.
    expect((body.timestamp as string) >= before).toBe(true);
    expect((body.timestamp as string) <= after).toBe(true);
  });

  // -- degraded paths --------------------------------------------------------

  it("returns status 'degraded' when mergepay-api is unreachable", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed")) // api probe
      .mockResolvedValueOnce({ status: 200 }); // stellar probe

    const res = (await GET()) as unknown as MockResponse;
    const body = res._body;

    expect(res._status).toBe(200); // always 200
    expect(body.status).toBe("degraded");
    expect(body.dependencies).toEqual({ api: "degraded", stellar: "ok" });
  });

  it("returns status 'degraded' when Horizon is unreachable", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 200 }) // api probe
      .mockRejectedValueOnce(new TypeError("fetch failed")); // stellar probe

    const res = (await GET()) as unknown as MockResponse;
    const body = res._body;

    expect(res._status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.dependencies).toEqual({ api: "ok", stellar: "degraded" });
  });

  it("returns status 'degraded' when both dependencies are unreachable", async () => {
    global.fetch = fetchFail();

    const res = (await GET()) as unknown as MockResponse;
    const body = res._body;

    expect(res._status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.dependencies).toEqual({ api: "degraded", stellar: "degraded" });
  });

  // -- env fallbacks ---------------------------------------------------------

  it("falls back to default URLs when env vars are absent", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_HORIZON_URL;

    const mockFetch = fetchOk();
    global.fetch = mockFetch;

    await GET();

    const calledUrls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(calledUrls[0]).toMatch(/^http:\/\/localhost:4000/);
    expect(calledUrls[1]).toMatch(/horizon/);
  });

  // -- probe probes the right paths -----------------------------------------

  it("probes <API_URL>/health and <HORIZON_URL> specifically", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    global.fetch = mockFetch;

    await GET();

    const calledUrls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(calledUrls[0]).toBe("http://api.test/health");
    expect(calledUrls[1]).toBe("http://horizon.test");
  });
});
