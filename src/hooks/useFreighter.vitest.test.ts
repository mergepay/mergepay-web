import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useFreighter } from "./useFreighter";
import * as stellar from "@/lib/stellar";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    connectWallet: vi.fn(),
    // These cases cover retry behaviour, not network state. Stubbing the
    // guard keeps them off the real Freighter API (which never answers under
    // jsdom); network mismatch has its own suite in
    // `useFreighter.network.vitest.test.ts`.
    assertWalletNetwork: vi.fn().mockResolvedValue(undefined),
  };
});

describe("useFreighter Hook (#283)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stellar.assertWalletNetwork).mockResolvedValue(undefined);
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

describe("useFreighter — connection state machine & remediation (#487)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stellar.assertWalletNetwork).mockResolvedValue(undefined);
  });

  it("walks idle → connecting → connected and exposes the state", async () => {
    // Assigned by the wallet mock while its (never-ending) prompt is open.
    let release: () => void = () => {};
    vi.mocked(stellar.connectWallet).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("GABC123");
        })
    );

    const { result } = renderHook(() => useFreighter());
    expect(result.current.status).toBe("idle");

    let connection: Promise<string> | null = null;
    await act(async () => {
      connection = result.current.connectWithRetry({ showToasts: false });
    });

    // While the extension prompt is open the button that started it must
    // stay disabled.
    expect(connection).not.toBeNull();
    expect(result.current.isConnecting).toBe(true);
    expect(result.current.status).toBe("connecting");

    await act(async () => {
      release();
    });

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("settles on error after a failure instead of staying stuck connecting", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(
      new stellar.UserRejectedError()
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ showToasts: false })
      ).rejects.toThrow(stellar.UserRejectedError);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.errorCode).toBe("user_rejected");
  });

  it("reports a locked wallet without retrying, with unlock remediation", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(
      new stellar.WalletLockedError()
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ maxRetries: 3, retryDelayMs: 10, showToasts: true })
      ).rejects.toThrow(stellar.WalletLockedError);
    });

    // A locked wallet stays locked until the user acts — no retry loop.
    expect(stellar.connectWallet).toHaveBeenCalledTimes(1);
    expect(result.current.errorCode).toBe("locked");
    expect(result.current.status).toBe("error");

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.error).mock.calls[0];
    expect(message).toBe("Your Freighter wallet is locked. Unlock it and try again.");
    expect(options?.description).toBe("Please unlock Freighter and try again.");
  });

  it("reports a missing extension as its own failure, with install remediation", async () => {
    vi.mocked(stellar.connectWallet).mockRejectedValue(
      new stellar.WalletNotInstalledError()
    );

    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ maxRetries: 3, retryDelayMs: 10, showToasts: true })
      ).rejects.toThrow(stellar.WalletNotInstalledError);
    });

    expect(stellar.connectWallet).toHaveBeenCalledTimes(1);
    expect(result.current.errorCode).toBe("not_installed");

    const [message, options] = vi.mocked(toast.error).mock.calls[0];
    expect(message).toMatch(/freighter extension not found/i);
    expect(options?.description).toMatch(/install it, then reconnect/i);
    expect(options?.action).toMatchObject({ label: "Get Freighter" });
  });

  it("joins a second connect attempt instead of opening another popup", async () => {
    // Assigned by the wallet mock while its (never-ending) prompt is open.
    let release: () => void = () => {};
    vi.mocked(stellar.connectWallet).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("GABC123");
        })
    );

    const { result } = renderHook(() => useFreighter());

    let first: Promise<string> | null = null;
    let second: Promise<string> | null = null;
    await act(async () => {
      first = result.current.connectWithRetry({ showToasts: false });
      second = result.current.connectWithRetry({ showToasts: false });
    });

    expect(second).toBe(first);

    await act(async () => {
      release();
    });

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(stellar.connectWallet).toHaveBeenCalledTimes(1);
  });
});
