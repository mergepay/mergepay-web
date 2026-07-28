import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { z } from "zod";

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
