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
