import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { walletChangeAction } from "../../hooks/useAuth";

describe("walletChangeAction (#104)", () => {
  const CURRENT = "GABCCURRENTPUBLICKEY000000000000000000000000000000000";

  it("returns 'none' when the address matches the authenticated account", () => {
    assert.equal(walletChangeAction({ address: CURRENT }, CURRENT), "none");
  });

  it("returns 'changed' when a different account is active", () => {
    const other = "GXYZOTHERPUBLICKEY0000000000000000000000000000000000";
    assert.equal(walletChangeAction({ address: other }, CURRENT), "changed");
  });

  it("returns 'disconnected' when the watcher reports an error", () => {
    assert.equal(
      walletChangeAction({ address: "", error: "not connected" }, CURRENT),
      "disconnected"
    );
  });

  it("returns 'disconnected' when the address is empty with no error", () => {
    assert.equal(walletChangeAction({ address: "" }, CURRENT), "disconnected");
  });

  it("prefers 'disconnected' over 'changed' when both an error and a mismatched address are present", () => {
    assert.equal(
      walletChangeAction({ address: "GSOMETHINGELSE", error: "boom" }, CURRENT),
      "disconnected"
    );
  });
});
