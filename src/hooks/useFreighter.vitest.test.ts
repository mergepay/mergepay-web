import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useFreighter } from "./useFreighter";
import * as stellar from "@/lib/stellar";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    connectWallet: vi.fn(),
  };
});

describe("useFreighter Hook (#283)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully connects wallet on first attempt", async () => {
    vi.mocked(stellar.connectWallet).mockResolvedValue("GABC123456789012345678901234567890123456789012345678901234");

    const { result } = renderHook(() => useFreighter());

    let address: string = "";
    await act(async () => {
      address = await result.current.connectWithRetry({ showToasts: false });
    });

    expect(address).toBe("GABC123456789012345678901234567890123456789012345678901234");
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("retries on transient failure up to maxRetries", async () => {
    vi.mocked(stellar.connectWallet)
      .mockRejectedValueOnce(new stellar.WalletNetworkError("Network timeout"))
      .mockResolvedValueOnce("GABC123");

    const { result } = renderHook(() => useFreighter());

    let address: string = "";
    await act(async () => {
      address = await result.current.connectWithRetry({ maxRetries: 2, retryDelayMs: 10, showToasts: true });
    });

    expect(address).toBe("GABC123");
    expect(stellar.connectWallet).toHaveBeenCalledTimes(2);
  });

  it("does not retry when user cancels request (user_rejected)", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(new stellar.UserRejectedError());

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ maxRetries: 3, retryDelayMs: 10, showToasts: true })
      ).rejects.toThrow(stellar.UserRejectedError);
    });

    expect(stellar.connectWallet).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("You cancelled the request. No transaction was submitted.");
  });

  it("executes custom wallet action with success toast", async () => {
    const { result } = renderHook(() => useFreighter());

    const action = vi.fn().mockResolvedValue("tx-hash-123");

    let txHash: string = "";
    await act(async () => {
      txHash = await result.current.executeWalletAction(action, {
        successMessage: "Transaction submitted!",
      });
    });

    expect(txHash).toBe("tx-hash-123");
    expect(toast.success).toHaveBeenCalledWith("Transaction submitted!");
  });
});
