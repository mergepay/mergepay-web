import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  withTimeout,
  connectWallet,
  autoReconnectWallet,
  WalletNotInstalledError,
  WalletNetworkError,
  WALLET_CONNECTED_SESSION_KEY,
  WALLET_ADDRESS_SESSION_KEY,
} from "../stellar";

describe("Freighter Connection & State Management", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("times out if Freighter API call hangs beyond duration", async () => {
    const hangingPromise = new Promise<never>(() => {});
    await expect(withTimeout(hangingPromise, 50, "Hanging request")).rejects.toThrow(
      WalletNetworkError
    );
  });

  it("throws WalletNotInstalledError and clears sessionStorage if Freighter is unavailable", async () => {
    sessionStorage.setItem(WALLET_CONNECTED_SESSION_KEY, "true");

    // Window object without freighter
    await expect(connectWallet()).rejects.toThrow(WalletNotInstalledError);
    expect(sessionStorage.getItem(WALLET_CONNECTED_SESSION_KEY)).toBeNull();
  });

  it("autoReconnectWallet returns null if session storage is empty", async () => {
    const result = await autoReconnectWallet();
    expect(result).toBeNull();
  });
});
