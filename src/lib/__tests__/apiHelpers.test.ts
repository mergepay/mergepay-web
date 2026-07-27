import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { apiError, apiSuccess, decodeJwtSubject } from "../apiHelpers";

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("apiError", () => {
  it("returns the supplied status code", () => {
    const res = apiError(404, "missing");
    assert.equal(res.status, 404);
  });

  it("emits only the error key when code and details are undefined", async () => {
    const res = apiError(400, "bad input");
    assert.deepEqual(await jsonBody(res), { error: "bad input" });
  });

  it("includes code when provided", async () => {
    const res = apiError(403, "nope", "FORBIDDEN");
    assert.deepEqual(await jsonBody(res), { error: "nope", code: "FORBIDDEN" });
  });

  it("includes code and details when provided", async () => {
    const res = apiError(
      400,
      "bad",
      "INVALID_INPUT",
      [{ path: ["amount"], message: "required" }]
    );
    assert.deepEqual(await jsonBody(res), {
      error: "bad",
      code: "INVALID_INPUT",
      details: [{ path: ["amount"], message: "required" }],
    });
  });

  it("omits details when undefined", async () => {
    const res = apiError(500, "boom", "INTERNAL", undefined);
    assert.deepEqual(await jsonBody(res), { error: "boom", code: "INTERNAL" });
  });

  it("still emits empty error bodies on the right status", async () => {
    const res = apiError(401, "no token");
    assert.equal(res.status, 401);
  });
});

describe("apiSuccess", () => {
  it("returns 200 by default", async () => {
    const res = apiSuccess({ ok: true });
    assert.equal(res.status, 200);
    assert.deepEqual(await jsonBody(res), { ok: true });
  });

  it("honours a custom status", async () => {
    const res = apiSuccess({ id: "x" }, 201);
    assert.equal(res.status, 201);
  });
});

describe("decodeJwtSubject", () => {
  const makeJwt = (payload: Record<string, unknown>): string => {
    const header = Buffer.from("{}", "utf8").toString("base64url");
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );
    return `${header}.${body}.signature`;
  };

  it("extracts the sub claim", () => {
    const token = makeJwt({ sub: "user-1", exp: 9999999999 });
    assert.equal(decodeJwtSubject(token), "user-1");
  });

  it("falls back to userId", () => {
    const token = makeJwt({ userId: "user-2" });
    assert.equal(decodeJwtSubject(token), "user-2");
  });

  it("falls back to id", () => {
    const token = makeJwt({ id: "user-3" });
    assert.equal(decodeJwtSubject(token), "user-3");
  });

  it("returns null for malformed JWTs", () => {
    assert.equal(decodeJwtSubject("not-a-token"), null);
    assert.equal(decodeJwtSubject("a.b"), null);
    assert.equal(decodeJwtSubject(""), null);
  });

  it("returns null when no identity claim is present", () => {
    const token = makeJwt({ exp: 9999999999 });
    assert.equal(decodeJwtSubject(token), null);
  });
});
