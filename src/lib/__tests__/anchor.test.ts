import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANCHOR_POLL_INTERVAL_MS,
  ANCHOR_POLL_MAX_PERSISTENT_FAILURES,
  anchorPollInterval,
  isTerminalAnchorStatus,
} from "../anchor-state";

describe("anchor polling", () => {
  it("stops polling after a terminal status", () => {
    for (const status of ["completed", "error", "refunded"] as const) {
      assert.equal(
        anchorPollInterval({ state: { data: { status } }, failureCount: 0 }),
        false,
      );
      assert.equal(isTerminalAnchorStatus(status), true);
    }
  });

  it("continues polling while a transfer is pending", () => {
    assert.equal(
      anchorPollInterval({
        state: { data: { status: "pending_anchor" } },
        failureCount: 0,
      }),
      ANCHOR_POLL_INTERVAL_MS,
    );
  });

  it("stops after persistent polling failures", () => {
    assert.equal(
      anchorPollInterval({
        state: { data: { status: "pending_anchor" } },
        failureCount: ANCHOR_POLL_MAX_PERSISTENT_FAILURES,
      }),
      false,
    );
  });
});