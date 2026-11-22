import { renderHook, act } from "@testing-library/react";
import { useWallet } from "../use-wallet";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  getPublicKey: vi.fn(),
  setAllowed: vi.fn(),
}));

import { isConnected, getPublicKey, setAllowed } from "@stellar/freighter-api";

describe("useWallet session timeout and reconnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects expired or disconnected wallet state", async () => {
    vi.mocked(isConnected).mockResolvedValue(false);

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.checkConnection();
    });

    expect(result.current.isConnected).toBe(false);
  });

  it("reconnects successfully when requested", async () => {
    vi.mocked(setAllowed).mockResolvedValue(true as any);
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getPublicKey).mockResolvedValue("G12345...");

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.reconnect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.publicKey).toBe("G12345...");
    expect(result.current.isExpired).toBe(false);
  });
});
