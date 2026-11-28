import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _body: data as Record<string, unknown>,
      _status: init?.status ?? 200,
      headers: new Headers(),
      json: async () => data,
    }),
  },
}));

import { __resetRateLimitStore } from "@/lib/rateLimiter";
import { POST } from "./route";

type MockResponse = {
  _body: Record<string, unknown>;
  _status: number;
  headers: Headers;
};

let tokenCounter = 0;

function request(token?: string): Promise<Response> {
  tokenCounter += 1;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return POST(
    new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers,
    })
  );
}

describe("POST /api/auth/refresh", () => {
  const savedFetch = global.fetch;
  const savedApiUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    __resetRateLimitStore();
  });

  afterEach(() => {
    global.fetch = savedFetch;
    process.env.NEXT_PUBLIC_API_URL = savedApiUrl;
    vi.restoreAllMocks();
  });

  it("requires a bearer token", async () => {
    const res = (await request()) as unknown as MockResponse;

    expect(res._status).toBe(401);
    expect(res._body.code).toBe("UNAUTHORIZED");
  });

  it("forwards the bearer token upstream and returns a refreshed session", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        token: "refreshed-token",
        user: { id: "user-1" },
      }),
    }) as unknown as typeof fetch;

    const res = (await request(`live-token-${tokenCounter}`)) as unknown as MockResponse;

    expect(res._status).toBe(200);
    expect(res._body.token).toBe("refreshed-token");
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/refresh$/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toMatch(
      /^Bearer live-token-/
    );
  });

  it("preserves an upstream 401 as a canonical unauthorized response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Token expired", code: "UNAUTHORIZED" }),
    }) as unknown as typeof fetch;

    const res = (await request(`expired-token-${tokenCounter}`)) as unknown as MockResponse;

    expect(res._status).toBe(401);
    expect(res._body).toEqual({
      error: "Token expired",
      code: "UNAUTHORIZED",
    });
  });

  it("returns 502 when the upstream refresh service is unavailable", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    const res = (await request(`network-token-${tokenCounter}`)) as unknown as MockResponse;

    expect(res._status).toBe(502);
    expect(res._body.code).toBe("UPSTREAM");
  });

  it("rate limits repeated refresh attempts for the same bearer token", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "refreshed-token", user: { id: "user-1" } }),
    }) as unknown as typeof fetch;

    const token = "same-refresh-token";
    let limited: MockResponse | null = null;
    for (let i = 0; i < 11; i += 1) {
      limited = (await request(token)) as unknown as MockResponse;
    }

    expect(limited?._status).toBe(429);
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
  });
});
