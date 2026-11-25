import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWalletConnectionRecovery } from "../useWalletConnectionRecovery";
import { useAuth } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { toast } from "sonner";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAutoReconnectWallet = vi.fn();
const mockIsFreighterAvailable = vi.fn();
const mockWithTimeout = vi.fn();
const mockShowWalletErrorToast = vi.fn();

// Mock the WalletError class so `instanceof` works in the hook.
// vi.hoisted ensures the class is available when the hoisted vi.mock factory runs.
const { MockWalletError } = vi.hoisted(() => {
  class MockWalletError extends Error {
    code: string;
    constructor(message: string, code = "unknown") {
      super(message);
      this.name = "WalletError";
      this.code = code;
    }
  }
  return { MockWalletError };
});

vi.mock("@/lib/stellar", () => ({
  autoReconnectWallet: () => mockAutoReconnectWallet(),
  isFreighterAvailable: () => mockIsFreighterAvailable(),
  // Pass-through: withTimeout just returns the wrapped promise.
  withTimeout: <T,>(promise: Promise<T>) => promise,
  WalletError: MockWalletError,
}));

vi.mock("@/lib/walletToasts", () => ({
  showWalletErrorToast: (...args: unknown[]) => mockShowWalletErrorToast(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────

describe("useWalletConnectionRecovery Hook (#598)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFreighterAvailable.mockResolvedValue(true);
    useAuth.getState().setActiveWalletPublicKey(null);
    useWalletStore.getState().setConnected(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("recovers a previously connected wallet on mount", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: true,
      publicKey: "GRECOVERED_ADDRESS_123456",
    });

    const { result } = renderHook(() => useWalletConnectionRecovery());

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });

    expect(result.current.publicKey).toBe("GRECOVERED_ADDRESS_123456");
    expect(useAuth.getState().activeWalletPublicKey).toBe("GRECOVERED_ADDRESS_123456");
    expect(useWalletStore.getState().isConnected).toBe(true);
    // No toast on a clean first recovery — only on retry success.
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows locked toast and sets status to 'locked' when wallet is locked", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: false,
      reason: "locked",
      message: "Your Freighter wallet is locked. Unlock it and try again.",
    });

    const { result } = renderHook(() => useWalletConnectionRecovery());

    await waitFor(() => {
      expect(result.current.status).toBe("locked");
    });

    expect(toast.warning).toHaveBeenCalledWith(
      "Freighter wallet is locked.",
      expect.objectContaining({
        description: "Unlock it in the extension to continue.",
      })
    );
    expect(useWalletStore.getState().isConnected).toBe(false);
  });

  it("shows error toast and sets status to 'unavailable' when Freighter is not installed", async () => {
    mockIsFreighterAvailable.mockResolvedValue(false);

    const { result } = renderHook(() => useWalletConnectionRecovery());

    await waitFor(() => {
      expect(result.current.status).toBe("unavailable");
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Freighter extension not found.",
      expect.objectContaining({
        description: "Install the Freighter extension and refresh the page.",
      })
    );
    expect(useWalletStore.getState().isConnected).toBe(false);
  });

  it("sets status to 'idle' when no previous wallet session exists", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: false,
      reason: "not_previously_connected",
      message: "No previous wallet connection found",
    });

    const { result } = renderHook(() => useWalletConnectionRecovery());

    await waitFor(() => {
      expect(result.current.status).toBe("idle");
    });

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("sets status to 'idle' when wallet has no account shared", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: false,
      reason: "no_account",
      message: "Wallet is available but no account is shared.",
    });

    const { result } = renderHook(() => useWalletConnectionRecovery());

    await waitFor(() => {
      expect(result.current.status).toBe("idle");
    });
  });

  it("retries transient failures and shows success toast on recovery", async () => {
    // First attempt fails with transient error, second succeeds.
    mockAutoReconnectWallet
      .mockResolvedValueOnce({
        success: false,
        reason: "error",
        message: "Couldn't reach the wallet. Check Freighter and try again.",
      })
      .mockResolvedValueOnce({
        success: true,
        publicKey: "GRETRY_SUCCESS_12345678",
      });

    const { result } = renderHook(() => useWalletConnectionRecovery());

    // The hook should eventually reach 'connected' after retrying.
    await waitFor(
      () => {
        expect(result.current.status).toBe("connected");
      },
      { timeout: 10_000 }
    );

    expect(result.current.publicKey).toBe("GRETRY_SUCCESS_12345678");
    expect(toast.success).toHaveBeenCalledWith(
      "Wallet reconnected.",
      expect.objectContaining({
        description: "Your Freighter wallet session has been restored.",
      })
    );
  }, 15_000);

  it("shows error toast after exhausting all retries on transient failures", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: false,
      reason: "error",
      message: "Couldn't reach the wallet.",
    });

    const { result } = renderHook(() => useWalletConnectionRecovery());

    await waitFor(
      () => {
        expect(result.current.status).toBe("error");
      },
      { timeout: 12_000 }
    );

    expect(mockShowWalletErrorToast).toHaveBeenCalled();
    expect(useWalletStore.getState().isConnected).toBe(false);
  }, 15_000);

  it("exposes a recover() function for manual retry", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: false,
      reason: "not_previously_connected",
      message: "No previous wallet connection found",
    });

    const { result } = renderHook(() => useWalletConnectionRecovery());

    await waitFor(() => {
      expect(result.current.status).toBe("idle");
    });

    // Now simulate a wallet becoming available.
    mockAutoReconnectWallet.mockResolvedValue({
      success: true,
      publicKey: "GMANUAL_RECOVER_12345678",
    });

    await act(async () => {
      result.current.recover();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });

    expect(result.current.publicKey).toBe("GMANUAL_RECOVER_12345678");
  });
});
