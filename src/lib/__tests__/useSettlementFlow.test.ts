import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldBlockSettlementSubmit } from "../useSettlementFlow";

describe("settlement submit guard (#95)", () => {
  it("blocks submission while mutation is pending", () => {
    assert.equal(
      shouldBlockSettlementSubmit({ isMutationPending: true, submittingRef: false }),
      true
    );
  });

  it("blocks submission while local latch is active", () => {
    assert.equal(
      shouldBlockSettlementSubmit({ isMutationPending: false, submittingRef: true }),
      true
    );
  });

  it("blocks when both signals are active", () => {
    assert.equal(
      shouldBlockSettlementSubmit({ isMutationPending: true, submittingRef: true }),
      true
    );
  });

  it("allows submission when both signals are idle", () => {
    assert.equal(
      shouldBlockSettlementSubmit({ isMutationPending: false, submittingRef: false }),
      false
    );
  });
});
