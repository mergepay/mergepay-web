import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import type { ExpenseResponse } from "../types";

describe("Session expiry signal", () => {
  beforeEach(() => {
    const { resetSessionExpired } = require("../api");
    resetSessionExpired();
  });

  it("starts as not expired", () => {
    const { isSessionExpired } = require("../api");
    assert.strictEqual(isSessionExpired(), false);
  });

  it("resets after calling resetSessionExpired", () => {
    const { isSessionExpired, resetSessionExpired } = require("../api");
    resetSessionExpired();
    assert.strictEqual(isSessionExpired(), false);
  });
});

describe("Runtime response validation (#76)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("ApiValidationError is a distinguishable Error subclass", () => {
    const { ApiValidationError } = require("../api");
    const err = new ApiValidationError();
    assert.ok(err instanceof Error);
    assert.equal(err.name, "ApiValidationError");
  });

  it("throws ApiValidationError when a 2xx body fails schema validation, without leaking the payload in the message", async () => {
    const { api } = require("../api");
    const { ApiValidationError } = require("../api");

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ user: { id: "u1" /* missing required fields */ } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    await assert.rejects(
      () => api.me(),
      (err: unknown) => {
        assert.ok(err instanceof ApiValidationError);
        assert.doesNotMatch((err as Error).message, /stellarPublicKey|u1/);
        return true;
      }
    );
  });

  it("passes valid schema-checked responses through unchanged", async () => {
    const { api } = require("../api");
    const validUser = {
      id: "u1",
      stellarPublicKey: "GABC",
      displayName: "Alice",
      avatarUrl: null,
      createdAt: "2026-01-01T00:00:00Z",
    };

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ user: validUser }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const result = await api.me();
    assert.deepStrictEqual(result.user, validUser);
  });

  it("z.ZodType schema option shape is accepted by request() without a type error at compile time", () => {
    // Compile-time guard: exercised by `npm run typecheck`. This test just
    // asserts the schema module still exports valid Zod schemas at runtime.
    const { MeResponseSchema } = require("../schemas");
    assert.ok(MeResponseSchema instanceof z.ZodType);
  });
});

describe("ApiTimeoutError", () => {
  it("is a distinguishable Error subclass", () => {
    const { ApiTimeoutError } = require("../api");
    const err = new ApiTimeoutError();
    assert.ok(err instanceof Error);
    assert.equal(err.name, "ApiTimeoutError");
    assert.equal(err.message, "Request timed out");
  });

  it("accepts a custom message", () => {
    const { ApiTimeoutError } = require("../api");
    const err = new ApiTimeoutError("Custom timeout");
    assert.equal(err.message, "Custom timeout");
  });
});

describe("createExpense idempotency", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockExpenseResponse: ExpenseResponse = {
    expense: {
      id: "exp-1",
      groupId: "g1",
      payerUserId: "u1",
      payer: {
        id: "u1",
        displayName: "Alice",
        stellarPublicKey: "G1",
        avatarUrl: null,
        createdAt: "2026-01-01",
      },
      title: "Test",
      description: null,
      amount: "10",
      assetCode: "XLM",
      assetIssuer: null,
      splitType: "equal",
      memo: null,
      receiptUrl: null,
      createdAt: "2026-01-01",
      shares: [],
    },
  };

  it("sends Idempotency-Key header and excludes it from JSON body", async () => {
    const { api } = require("../api");
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown = null;

    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(JSON.stringify(mockExpenseResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await api.createExpense("g1", {
      title: "Test",
      amount: "10",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      idempotencyKey: "my-key-123",
    });

    assert.equal(capturedHeaders["Idempotency-Key"], "my-key-123");
    const body = capturedBody as Record<string, unknown>;
    assert.equal(body.idempotencyKey, undefined);
    assert.equal(body.title, "Test");
  });

  it("omits Idempotency-Key header when not provided", async () => {
    const { api } = require("../api");
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify(mockExpenseResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await api.createExpense("g1", {
      title: "Test",
      amount: "10",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
    });

    assert.equal(capturedHeaders["Idempotency-Key"], undefined);
  });

  it("throws ApiTimeoutError when the request exceeds the timeout", async () => {
    const mod = require("../api");
    const api = mod.api;
    const ApiTimeoutError = mod.ApiTimeoutError;

    // Create a fetch that hangs until aborted.
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        // Reject when the signal fires, simulating timeout
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }
      })) as typeof fetch;

    await assert.rejects(
      () =>
        api.createExpense("g1", {
          title: "Test",
          amount: "10",
          assetCode: "XLM",
          splitType: "equal",
          shares: [{ userId: "u1" }],
          idempotencyKey: "key-timeout",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ApiTimeoutError);
        return true;
      }
    );
  });

  it("retry with the same idempotency key sends the same header value twice", async () => {
    const mod = require("../api");
    const api = mod.api;
    const capturedKeys: string[] = [];

    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      capturedKeys.push(headers["Idempotency-Key"] ?? "");
      return new Response(JSON.stringify(mockExpenseResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await api.createExpense("g1", {
      title: "Test",
      amount: "10",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      idempotencyKey: "retry-key",
    });

    await api.createExpense("g1", {
      title: "Test",
      amount: "10",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "u1" }],
      idempotencyKey: "retry-key",
    });

    assert.equal(capturedKeys.length, 2);
    assert.equal(capturedKeys[0], "retry-key");
    assert.equal(capturedKeys[1], "retry-key");
  });

  it("throws ApiRequestError on a definitive 4xx server response", async () => {
    const mod = require("../api");
    const api = mod.api;
    const ApiRequestError = mod.ApiRequestError;

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: "Validation failed", code: "INVALID_INPUT" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )) as typeof fetch;

    await assert.rejects(
      () =>
        api.createExpense("g1", {
          title: "",
          amount: "10",
          assetCode: "XLM",
          splitType: "equal",
          shares: [{ userId: "u1" }],
        }),
      (err: unknown) => {
        assert.ok(err instanceof ApiRequestError);
        assert.equal((err as { status: number }).status, 400);
        return true;
      }
    );
  });
});
