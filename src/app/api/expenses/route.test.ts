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
      /** The rate-limit wrapper stamps headers onto every response. */
      headers: new Headers(),
      json: async () => data,
    }),
  },
}));

import { POST } from "./route";

type MockResponse = { _body: Record<string, unknown>; _status: number };

const VALID_BODY = {
  title: "Dinner",
  amount: "150.00",
  assetCode: "XLM",
  assetIssuer: null,
  splitType: "equal" as const,
  shares: [{ userId: "user-a" }, { userId: "user-b" }],
};

/**
 * The route rate-limits by a hash of the bearer token, so each test uses a
 * unique token to get a fresh bucket.
 */
let tokenCounter = 0;
function post(body: unknown): Promise<Response> {
  tokenCounter += 1;
  return POST(
    new Request("http://localhost/api/expenses?groupId=grp-1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer test-token-${tokenCounter}`,
      },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/expenses — amount validation", () => {
  const savedFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ expense: { id: "exp-1" } }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = savedFetch;
    vi.restoreAllMocks();
  });

  const invalidAmounts: Array<[string, unknown]> = [
    ["a negative string", "-1"],
    ["a negative number", -1],
    ["zero", "0"],
    ["a zero number", 0],
    ["too many decimal places", "1.00000001"],
    ["a non-numeric string", "abc"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["exponential notation", "1e5"],
    ["an amount beyond Stellar's range", "922337203685.4775808"],
  ];

  for (const [label, amount] of invalidAmounts) {
    it(`returns 400 for ${label}`, async () => {
      const res = (await post({
        ...VALID_BODY,
        amount,
      })) as unknown as MockResponse;

      expect(res._status).toBe(400);
      expect(res._body.error).toBe("Invalid amount");
      expect(res._body.code).toBe("INVALID_INPUT");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  }

  it("includes a descriptive reason in details", async () => {
    const res = (await post({
      ...VALID_BODY,
      amount: "-1",
    })) as unknown as MockResponse;

    expect(res._body.details).toEqual([
      { path: ["amount"], message: expect.stringMatching(/positive|zero/i) },
    ]);
  });

  it("forwards a valid amount upstream and returns 201", async () => {
    const res = (await post(VALID_BODY)) as unknown as MockResponse;

    expect(res._status).toBe(201);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).amount).toBe("150.00");
  });

  it("accepts the smallest representable amount", async () => {
    const res = (await post({
      ...VALID_BODY,
      amount: "0.0000001",
    })) as unknown as MockResponse;

    expect(res._status).toBe(201);
  });

  it("normalizes a numeric amount to a plain decimal string", async () => {
    const res = (await post({
      ...VALID_BODY,
      amount: 12.5,
    })) as unknown as MockResponse;

    expect(res._status).toBe(201);
    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).amount).toBe("12.5");
  });

  it("still rejects a payload that fails the surrounding schema", async () => {
    const res = (await post({
      ...VALID_BODY,
      title: "",
    })) as unknown as MockResponse;

    expect(res._status).toBe(400);
    expect(res._body.error).toBe("Invalid expense payload.");
  });

  it("requires authentication before validating the amount", async () => {
    const res = (await POST(
      new Request("http://localhost/api/expenses?groupId=grp-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_BODY, amount: "-1" }),
      })
    )) as unknown as MockResponse;

    expect(res._status).toBe(401);
  });
});
