import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldBlockSettlementSubmit, isNetworkMismatch } from "../useSettlementFlow";
import { NETWORK_PASSPHRASE } from "../constants";

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

describe("isNetworkMismatch (#118)", () => {
  it("returns false when the passphrase matches the configured network", () => {
    assert.equal(isNetworkMismatch(NETWORK_PASSPHRASE), false);
  });

  it("returns true when the passphrase does not match", () => {
    assert.equal(
      isNetworkMismatch("Public Global Stellar Network ; September 2015"),
      NETWORK_PASSPHRASE !== "Public Global Stellar Network ; September 2015"
    );
  });

  it("returns false for null passphrase (no network info available)", () => {
    assert.equal(isNetworkMismatch(null), false);
  });

  it("returns false for undefined passphrase", () => {
    assert.equal(isNetworkMismatch(undefined), false);
    });

  it("returns false for empty string passphrase", () => {
    assert.equal(isNetworkMismatch(""), false);
  });

  it("uses the default NETWORK_PASSPHRASE when no expected value is given", () => {
    assert.equal(isNetworkMismatch(NETWORK_PASSPHRASE), false);
  });

  it("allows overriding the expected passphrase for testing", () => {
    // If the intent says testnet but we expect mainnet, that's a mismatch
    assert.equal(
      isNetworkMismatch(
        "Test SDF Network ; September 2015",
        "Public Global Stellar Network ; September 2015"
      ),
      true
    );
    // Matching override should pass
    assert.equal(
      isNetworkMismatch(
        "Test SDF Network ; September 2015",
        "Test SDF Network ; September 2015"
      ),
      false
    );
  });
});
