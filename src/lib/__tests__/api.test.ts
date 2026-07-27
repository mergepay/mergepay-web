import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

describe("Session expiry signal", () => {
  beforeEach(() => {
    const { resetSessionExpired } = require("../api");
    resetSessionExpired();
  });

  it("starts as not expired", () => {
    const { isSessionExpired } = require("../api");
    assert.strictEqual(isSessionExpired(), false);
  });

  it("resets after calling resetSessionExpired", () => {
    const { isSessionExpired, resetSessionExpired } = require("../api");
    resetSessionExpired();
    assert.strictEqual(isSessionExpired(), false);
  });
});
