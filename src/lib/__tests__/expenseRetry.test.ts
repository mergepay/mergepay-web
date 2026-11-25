import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXPENSE_CREATE_MAX_RETRIES,
  expenseCreateRetryDelay,
  shouldRetryExpenseCreate,
} from "../queries";
import { ApiRequestError } from "../errorHandler";

describe("expense creation retry policy", () => {
  it("backs off exponentially and caps the wait", () => {
    assert.equal(expenseCreateRetryDelay(0), 1000);
    assert.equal(expenseCreateRetryDelay(1), 2000);
    assert.equal(expenseCreateRetryDelay(2), 4000);
    assert.equal(expenseCreateRetryDelay(10), 8000);
  });

  it("retries transient failures up to the cap, then stops", () => {
    const networkDrop = new ApiRequestError(0, "network_error", "offline");

    assert.equal(shouldRetryExpenseCreate(0, networkDrop), true);
    assert.equal(
      shouldRetryExpenseCreate(EXPENSE_CREATE_MAX_RETRIES - 1, networkDrop),
      true
    );
    assert.equal(
      shouldRetryExpenseCreate(EXPENSE_CREATE_MAX_RETRIES, networkDrop),
      false
    );

    const serverError = new ApiRequestError(503, "UPSTREAM", "unavailable");
    assert.equal(shouldRetryExpenseCreate(0, serverError), true);
  });

  it("never retries a deterministic 4xx response", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      const clientError = new ApiRequestError(status, "CLIENT", "bad request");
      assert.equal(
        shouldRetryExpenseCreate(0, clientError),
        false,
        `status ${status} must not be retried`
      );
    }
  });
});
