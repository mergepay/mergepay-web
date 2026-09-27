import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFreighter } from "../useFreighter";
import * as stellar from "@/lib/stellar";

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
  },
}));

describe("useFreighter custom error and retry tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("detects user rejected error correctly", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(
      new stellar.UserRejectedError()
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ showToasts: false })
      ).rejects.toThrow(stellar.UserRejectedError);
    });

    expect(result.current.errorCode).toBe("user_rejected");
  });
});
