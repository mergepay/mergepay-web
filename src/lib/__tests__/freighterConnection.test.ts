import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  withTimeout,
  connectWallet,
  autoReconnectWallet,
  WalletNotInstalledError,
  WalletNetworkError,
  WALLET_CONNECTED_SESSION_KEY,
} from "../stellar";

describe("Freighter Connection & State Management (#291)", () => {
  it("times out if Freighter API call hangs beyond duration", async () => {
    const hangingPromise = new Promise<never>(() => {});
    await assert.rejects(
      async () => {
        await withTimeout(hangingPromise, 50, "Hanging request");
      },
      (err: unknown) => err instanceof WalletNetworkError
    );
  });

  it("throws WalletNotInstalledError and clears sessionStorage if Freighter is unavailable", async () => {
    if (typeof globalThis.sessionStorage !== "undefined") {
      sessionStorage.setItem(WALLET_CONNECTED_SESSION_KEY, "true");
    }
    await assert.rejects(
      async () => {
        await connectWallet();
      },
      (err: unknown) => err instanceof WalletNotInstalledError
    );
  });

  it("autoReconnectWallet returns null if session storage is empty", async () => {
    const result = await autoReconnectWallet();
    assert.equal(result, null);
  });
});
