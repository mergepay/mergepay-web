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

describe("API request session expiry handling", () => {
  beforeEach(() => {
    const { resetSessionExpired } = require("../api");
    resetSessionExpired();
  });

  it("sets isSessionExpired to true and clears auth on 401", async () => {
    const { isSessionExpired } = require("../api");
    const { useAuth } = require("../auth-store");
    
    // Setup a mock token so that api.ts sees it
    useAuth.getState().setSession("fake_token", { id: "1" });

    // We can test this by mocking fetch globally for one request
    const originalFetch = global.fetch;
    let fetchCalled = false;
    global.fetch = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    try {
      const { api } = require("../api");
      // Call a protected endpoint
      await api.me().catch(() => {});
      
      assert.strictEqual(fetchCalled, true);
      assert.strictEqual(isSessionExpired(), true);
      assert.strictEqual(useAuth.getState().token, null);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
