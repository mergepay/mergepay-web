import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANCHOR_POLL_INTERVAL_MS,
  ANCHOR_POLL_MAX_PERSISTENT_FAILURES,
  anchorPollInterval,
  isTerminalAnchorStatus,
  mapAnchorStatusToUiState,
  getStateDescription,
  isUserCancelledStatus,
  type AnchorOperationState,
} from "../anchor-state";
import type { AnchorSessionStatus } from "../types";

describe("anchor polling", () => {
  it("stops polling after a terminal status", () => {
    for (const status of ["completed", "error", "refunded"] as const) {
      assert.equal(anchorPollInterval({ state: { data: { status } }, failureCount: 0 }), false);
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

describe("anchor status mapping", () => {
  it("maps incomplete and pending_user_transfer_start to pending", () => {
    assert.equal(mapAnchorStatusToUiState("incomplete"), "pending");
    assert.equal(mapAnchorStatusToUiState("pending_user_transfer_start"), "pending");
  });

  it("maps pending_anchor to processing", () => {
    assert.equal(mapAnchorStatusToUiState("pending_anchor"), "processing");
  });

  it("maps completed to completed", () => {
    assert.equal(mapAnchorStatusToUiState("completed"), "completed");
  });

  it("maps error and refunded to failed", () => {
    assert.equal(mapAnchorStatusToUiState("error"), "failed");
    assert.equal(mapAnchorStatusToUiState("refunded"), "failed");
  });

  it("maps unknown statuses to unknown", () => {
    assert.equal(mapAnchorStatusToUiState("no_market_active" as AnchorSessionStatus), "unknown");
    assert.equal(mapAnchorStatusToUiState("pending_external" as AnchorSessionStatus), "unknown");
  });

  it("returns correct descriptions for each UI state", () => {
    const states: AnchorOperationState[] = [
      "pending",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "unknown",
    ];
    for (const state of states) {
      const desc = getStateDescription(state);
      assert.ok(typeof desc === "string" && desc.length > 0, `description for ${state} is non-empty`);
    }
    assert.equal(getStateDescription("pending"), "Waiting for you to complete the transfer");
    assert.equal(getStateDescription("processing"), "Anchor is processing your transfer");
    assert.equal(getStateDescription("completed"), "Transfer completed successfully");
    assert.equal(getStateDescription("failed"), "Transfer failed");
    assert.equal(getStateDescription("cancelled"), "Transfer was cancelled");
    assert.equal(getStateDescription("unknown"), "Status unknown");
  });

  it("isUserCancelledStatus returns false for all SEP-24 statuses", () => {
    const statuses: AnchorSessionStatus[] = [
      "incomplete",
      "pending_user_transfer_start",
      "pending_anchor",
      "pending_external",
      "no_market_active",
      "completed",
      "error",
      "refunded",
    ];
    for (const status of statuses) {
      assert.equal(isUserCancelledStatus(status), false);
    }
  });
});

describe("isTerminalAnchorStatus", () => {
  it("returns true for terminal statuses", () => {
    assert.equal(isTerminalAnchorStatus("completed"), true);
    assert.equal(isTerminalAnchorStatus("error"), true);
    assert.equal(isTerminalAnchorStatus("refunded"), true);
  });

  it("returns false for non-terminal statuses", () => {
    assert.equal(isTerminalAnchorStatus("incomplete"), false);
    assert.equal(isTerminalAnchorStatus("pending_user_transfer_start"), false);
    assert.equal(isTerminalAnchorStatus("pending_anchor"), false);
    assert.equal(isTerminalAnchorStatus("pending_external"), false);
    assert.equal(isTerminalAnchorStatus("no_market_active"), false);
  });
});