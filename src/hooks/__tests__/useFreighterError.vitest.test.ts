import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreighter } from "../useFreighter";
import * as stellar from "@/lib/stellar";
import { toast } from "sonner";

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    connectWallet: vi.fn(),
    assertWalletNetwork: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useFreighter connection error handling & network mismatch alerts (#711)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("detects wallet not installed error correctly", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(
      new stellar.WalletNotInstalledError()
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ showToasts: false })
      ).rejects.toThrow(stellar.WalletNotInstalledError);
    });

    expect(result.current.errorCode).toBe("not_installed");
    expect(result.current.status).toBe("error");
  });

  it("detects user rejected error correctly and triggers informative warning toast (#711)", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(
      new stellar.UserRejectedError()
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ showToasts: true })
      ).rejects.toThrow(stellar.UserRejectedError);
    });

    expect(result.current.errorCode).toBe("user_rejected");
    expect(result.current.status).toBe("error");
    expect(toast.warning).toHaveBeenCalled();
  });

  it("detects network mismatch error and alerts user to switch network (#711)", async () => {
    vi.mocked(stellar.connectWallet).mockResolvedValue("GABC123");
    vi.mocked(stellar.assertWalletNetwork).mockRejectedValue(
      new stellar.NetworkMismatchError("Testnet", "Public Global Stellar Network ; September 2015")
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ showToasts: true })
      ).rejects.toThrow(stellar.NetworkMismatchError);
    });

    expect(result.current.errorCode).toBe("network_mismatch");
    expect(result.current.status).toBe("error");
    expect(toast.warning).toHaveBeenCalled();
  });

  it("detects locked wallet error and surfaces remediation (#711)", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(
      new stellar.WalletLockedError()
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ showToasts: false })
      ).rejects.toThrow(stellar.WalletLockedError);
    });

    expect(result.current.errorCode).toBe("locked");
    expect(result.current.status).toBe("error");
  });

  it("performs clean state reset and session clearance on wallet disconnect (#711)", async () => {
    sessionStorage.setItem(stellar.WALLET_CONNECTED_SESSION_KEY, "true");
    sessionStorage.setItem(stellar.WALLET_ADDRESS_SESSION_KEY, "GABC123");

    const { result } = renderHook(() => useFreighter());

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.errorCode).toBeNull();
    expect(sessionStorage.getItem(stellar.WALLET_CONNECTED_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(stellar.WALLET_ADDRESS_SESSION_KEY)).toBeNull();
  });
});
