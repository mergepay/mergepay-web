import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import {
  ApiRequestError,
  ApiValidationError,
  apiErrorMessage,
  GENERIC_ERROR_MESSAGE,
  handleApiError,
  isAbortError,
  NETWORK_ERROR_MESSAGE,
  networkFailure,
  logRenderError,
} from "../errorHandler";

describe("apiErrorMessage", () => {
  it("returns the API-provided message for ApiRequestError", () => {
    const err = new ApiRequestError(422, "insufficient_balance", "Insufficient balance");
    assert.strictEqual(apiErrorMessage(err), "Insufficient balance");
  });

  it("returns the message for ApiValidationError", () => {
    const err = new ApiValidationError();
    assert.strictEqual(
      apiErrorMessage(err),
      "Received an unexpected response from the server."
    );
  });

  it("formats Zod field issues", () => {
    const schema = z.object({ amount: z.string().min(1, "Required") });
    const result = schema.safeParse({ amount: "" });
    assert.ok(!result.success);
    const message = apiErrorMessage(result.error);
    assert.strictEqual(message, "amount: Required");
  });

  it("uses the message of plain Error instances", () => {
    assert.strictEqual(apiErrorMessage(new Error("boom")), "boom");
  });

  it("falls back for non-Error values", () => {
    assert.strictEqual(apiErrorMessage("nope"), GENERIC_ERROR_MESSAGE);
    assert.strictEqual(apiErrorMessage(undefined), GENERIC_ERROR_MESSAGE);
    assert.strictEqual(apiErrorMessage(null, "Custom fallback"), "Custom fallback");
  });

  it("returns an empty string for aborted requests", () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    assert.strictEqual(apiErrorMessage(abort), "");
  });
});

describe("isAbortError", () => {
  it("detects DOMException AbortError", () => {
    assert.strictEqual(
      isAbortError(new DOMException("aborted", "AbortError")),
      true
    );
  });

  it("detects Error objects named AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    assert.strictEqual(isAbortError(err), true);
  });

  it("returns false for other errors", () => {
    assert.strictEqual(isAbortError(new TypeError("Failed to fetch")), false);
    assert.strictEqual(isAbortError(new ApiRequestError(500, "x", "y")), false);
    assert.strictEqual(isAbortError(undefined), false);
  });
});

describe("handleApiError", () => {
  it("returns the message in silent mode without throwing", () => {
    const err = new ApiRequestError(500, "server_error", "Server exploded");
    assert.strictEqual(
      handleApiError(err, "fallback", { silent: true }),
      "Server exploded"
    );
  });

  it("uses the context fallback for unknown errors in silent mode", () => {
    assert.strictEqual(
      handleApiError({}, "Could not frobnicate", { silent: true }),
      "Could not frobnicate"
    );
  });

  it("suppresses aborted requests entirely", () => {
    const abort = new DOMException("aborted", "AbortError");
    assert.strictEqual(handleApiError(abort, "fallback", { silent: true }), "");
  });
});

describe("networkFailure", () => {
  it("converts a fetch TypeError into an ApiRequestError with status 0", () => {
    const err = networkFailure(new TypeError("Failed to fetch"), {
      silent: true,
    });
    assert.ok(err instanceof ApiRequestError);
    const apiErr = err as ApiRequestError;
    assert.strictEqual(apiErr.status, 0);
    assert.strictEqual(apiErr.code, "network_error");
    assert.strictEqual(apiErr.message, NETWORK_ERROR_MESSAGE);
  });

  it("passes abort errors through untouched", () => {
    const abort = new DOMException("aborted", "AbortError");
    const err = networkFailure(abort);
    assert.strictEqual(err, abort);
  });
});

describe("logRenderError", () => {
  /** Capture `console.error` calls made while `fn` runs. */
  function capture(fn: () => void): unknown[][] {
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      fn();
    } finally {
      console.error = original;
    }
    return calls;
  }

  it("logs one structured line with the component stack outside production", () => {
    const calls = capture(() =>
      logRenderError(new Error("render exploded"), { componentStack: "\n    at Bomb" })
    );
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], "[mergepay] render error");
    assert.deepEqual(calls[0][1], {
      name: "Error",
      message: "render exploded",
      componentStack: "\n    at Bomb",
    });
  });

  it("stays silent in production", () => {
    // Next's typings freeze `NODE_ENV`, which is exactly what a test flipping
    // the branch needs to get past.
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      assert.strictEqual(capture(() => logRenderError(new Error("x"))).length, 0);
    } finally {
      env.NODE_ENV = previous;
    }
  });

  it("keeps only scalar fields, so attached state never reaches the console", () => {
    // A wallet error can have the account, the XDR, or the signing payload hung
    // off it; the log line must survive that without repeating it.
    const leaky = Object.assign(new Error("signing failed"), {
      secretKey: "SABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP",
    });
    const calls = capture(() => logRenderError(leaky));
    assert.deepEqual(calls[0][1], { name: "Error", message: "signing failed" });
    assert.ok(!JSON.stringify(calls).includes("SABCDEFGHIJKLMNOPQRSTUVWXYZ"));
  });

  it("describes a thrown non-Error without stringifying its contents", () => {
    const calls = capture(() => logRenderError({ amount: "10.00", payer: "user-1" }));
    assert.deepEqual(calls[0][1], { message: "[object Object]" });
  });

  it("omits a missing component stack instead of logging null", () => {
    const calls = capture(() => logRenderError(new Error("x"), { componentStack: null }));
    assert.deepEqual(calls[0][1], { name: "Error", message: "x" });
  });
});
