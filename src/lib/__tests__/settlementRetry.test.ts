import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recoveryActionFor, retryLabelFor } from "../settlementRetry";

describe("recoveryActionFor", () => {
  it("offers a retry when the user cancelled the signature", () => {
    assert.equal(recoveryActionFor("user_rejected"), "retry");
  });

  it("offers a retry for a transient wallet or network failure", () => {
    assert.equal(recoveryActionFor("network"), "retry");
    assert.equal(recoveryActionFor("unknown"), "retry");
  });

  it("offers a retry for non-wallet failures", () => {
    // API errors, a Stellar-rejected transaction, and validation failures all
    // arrive without a wallet error code.
    assert.equal(recoveryActionFor(null), "retry");
    assert.equal(recoveryActionFor(undefined), "retry");
  });

  it("prompts reconnection when the wallet link is broken", () => {
    assert.equal(recoveryActionFor("disconnected"), "reconnect");
    assert.equal(recoveryActionFor("locked"), "reconnect");
  });

  it("prompts installation when Freighter is absent", () => {
    assert.equal(recoveryActionFor("not_installed"), "install");
  });
});

describe("retryLabelFor", () => {
  it("labels the reconnect path distinctly", () => {
    assert.equal(retryLabelFor("disconnected"), "Reconnect wallet");
    assert.equal(retryLabelFor("locked"), "Reconnect wallet");
  });

  it("labels every retryable failure the same way", () => {
    assert.equal(retryLabelFor("user_rejected"), "Try again");
    assert.equal(retryLabelFor("network"), "Try again");
    assert.equal(retryLabelFor(null), "Try again");
  });
});
