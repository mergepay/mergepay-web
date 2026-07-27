import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SETTLEMENT_POLL_INTERVAL_MS,
  SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES,
  settlementPollInterval,
  shouldBlockExpenseSubmit,
} from "../queries";

describe("settlement polling (#86)", () => {
  it("returns false when status is confirmed", () => {
    assert.equal(
      settlementPollInterval({
        state: { data: { status: "confirmed" } },
      }),
      false
    );
  });

  it("returns false when status is failed", () => {
    assert.equal(
      settlementPollInterval({
        state: { data: { status: "failed" } },
      }),
      false
    );
  });

  it("keeps polling at the configured interval when status is pending", () => {
    assert.equal(
      settlementPollInterval({
        state: { data: { status: "pending" } },
      }),
      SETTLEMENT_POLL_INTERVAL_MS
    );
  });

  it("keeps polling at the configured interval when status is submitted", () => {
    assert.equal(
      settlementPollInterval({
        state: { data: { status: "submitted" } },
      }),
      SETTLEMENT_POLL_INTERVAL_MS
    );
  });

  it("keeps polling when no data has arrived yet", () => {
    assert.equal(
      settlementPollInterval({ state: { data: undefined } }),
      SETTLEMENT_POLL_INTERVAL_MS
    );
  });

  it("keeps polling when data has no status yet", () => {
    assert.equal(
      settlementPollInterval({ state: { data: {} } }),
      SETTLEMENT_POLL_INTERVAL_MS
    );
  });

  it("stops polling once the failure cap is reached (#86 no infinite loop)", () => {
    assert.equal(
      settlementPollInterval({
        state: { data: { status: "submitted" } },
        failureCount: SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES,
      }),
      false
    );
    assert.equal(
      settlementPollInterval({
        state: {},
        failureCount: SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES + 1,
      }),
      false
    );
  });

  it("keeps polling while failures are below the cap", () => {
    assert.equal(
      settlementPollInterval({ state: {}, failureCount: 0 }),
      SETTLEMENT_POLL_INTERVAL_MS
    );
    assert.equal(
      settlementPollInterval({
        state: { data: { status: "submitted" } },
        failureCount: SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES - 1,
      }),
      SETTLEMENT_POLL_INTERVAL_MS
    );
  });

  it("terminal status wins over failure count", () => {
    assert.equal(
      settlementPollInterval({
        state: { data: { status: "confirmed" } },
        failureCount: 99,
      }),
      false
    );
  });

  it("uses conservative parameters (3s interval, capped persistent failures)", () => {
    assert.equal(SETTLEMENT_POLL_INTERVAL_MS, 3_000);
    assert.ok(SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES >= 1);
    assert.ok(SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES <= 5);
  });
});

describe("expense submit guard (#88)", () => {
  it("blocks submission while mutation is pending", () => {
    assert.equal(
      shouldBlockExpenseSubmit({ isPending: true, submitting: false }),
      true
    );
  });

  it("blocks submission while local latch is set", () => {
    assert.equal(
      shouldBlockExpenseSubmit({ isPending: false, submitting: true }),
      true
    );
  });

  it("blocks when both signals are active", () => {
    assert.equal(
      shouldBlockExpenseSubmit({ isPending: true, submitting: true }),
      true
    );
  });

  it("allows submission when both signals are idle", () => {
    assert.equal(
      shouldBlockExpenseSubmit({ isPending: false, submitting: false }),
      false
    );
  });
});
