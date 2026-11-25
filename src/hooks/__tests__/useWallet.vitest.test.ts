import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWallet } from "../useWallet";
import { useAuth } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { toast } from "sonner";

// Mock @stellar/freighter-api
let mockWatcherCallback: ((params: { address?: string; error?: string; network?: string }) => void) | null = null;
const mockWatch = vi.fn((cb) => {
  mockWatcherCallback = cb;
});
const mockStop = vi.fn();

vi.mock("@stellar/freighter-api", () => {
  class MockWatchWalletChanges {
    watch(cb: (params: { address?: string; error?: string; network?: string }) => void) {
      mockWatch(cb);
    }
    stop() {
      mockStop();
    }
  }
  return {
    WatchWalletChanges: MockWatchWalletChanges,
    isConnected: vi.fn().mockResolvedValue(true),
    getAddress: vi.fn().mockResolvedValue({ address: "G_INITIAL" }),
  };
});

// Mock @/lib/stellar
const mockAutoReconnectWallet = vi.fn();
const mockIsFreighterAvailable = vi.fn();
const mockConnectWallet = vi.fn();
const mockGetGrantedAddress = vi.fn();

vi.mock("@/lib/stellar", () => {
  class WalletError extends Error {
    code: string;
    constructor(message: string, code = "unknown") {
      super(message);
      this.code = code;
    }
  }
  return {
    autoReconnectWallet: () => mockAutoReconnectWallet(),
    isFreighterAvailable: () => mockIsFreighterAvailable(),
    connectWallet: () => mockConnectWallet(),
    getGrantedAddress: () => mockGetGrantedAddress(),
    WalletError,
    WALLET_CONNECTED_SESSION_KEY: "stellar_wallet_connected",
    WALLET_ADDRESS_SESSION_KEY: "stellar_wallet_address",
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("useWallet Hook State Transitions (#352)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcherCallback = null;
    useAuth.getState().setActiveWalletPublicKey(null);
    useWalletStore.getState().setConnected(null);
    mockIsFreighterAvailable.mockResolvedValue(true);
    mockAutoReconnectWallet.mockResolvedValue({ success: false, reason: "not_previously_connected" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with uninstalled state if Freighter is unavailable", async () => {
    mockIsFreighterAvailable.mockResolvedValue(false);

    const { result } = renderHook(() => useWallet());

    await waitFor(() => {
      expect(result.current.isInstalled).toBe(false);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.publicKey).toBeNull();
    });
  });

  it("auto-reconnects when previous session is valid", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: true,
      publicKey: "GAUTO_RECONNECTED_ADDRESS_123456789",
    });

    const { result } = renderHook(() => useWallet({ autoReconnect: true }));

    await waitFor(() => {
      expect(result.current.publicKey).toBe("GAUTO_RECONNECTED_ADDRESS_123456789");
      expect(result.current.isConnected).toBe(true);
      expect(useAuth.getState().activeWalletPublicKey).toBe("GAUTO_RECONNECTED_ADDRESS_123456789");
      expect(useWalletStore.getState().isConnected).toBe(true);
    });
  });

  it("handles locked wallet state during auto-reconnect", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: false,
      reason: "locked",
    });

    const { result } = renderHook(() => useWallet({ autoReconnect: true }));

    await waitFor(() => {
      expect(result.current.isLocked).toBe(true);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.publicKey).toBeNull();
    });
  });

  it("listens to account changes and updates store with toast notification", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: true,
      publicKey: "GACCOUNT_ONE_1234",
    });

    const { result } = renderHook(() => useWallet({ showToasts: true }));

    await waitFor(() => {
      expect(result.current.publicKey).toBe("GACCOUNT_ONE_1234");
    });

    expect(mockWatch).toHaveBeenCalled();
    expect(mockWatcherCallback).not.toBeNull();

    // Trigger account switch in Freighter
    act(() => {
      mockWatcherCallback?.({ address: "GACCOUNT_TWO_5678" });
    });

    expect(useAuth.getState().activeWalletPublicKey).toBe("GACCOUNT_TWO_5678");
    expect(useWalletStore.getState().isConnected).toBe(true);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("switched to"));
  });

  it("handles wallet disconnect event from watcher", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: true,
      publicKey: "GACCOUNT_ACTIVE",
    });

    const { result } = renderHook(() => useWallet({ showToasts: true }));

    await waitFor(() => {
      expect(result.current.publicKey).toBe("GACCOUNT_ACTIVE");
    });

    // Trigger disconnect event (address becomes empty)
    act(() => {
      mockWatcherCallback?.({ address: "" });
    });

    expect(useAuth.getState().activeWalletPublicKey).toBeNull();
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("disconnected"));
  });

  it("handles wallet locked event from watcher", async () => {
    mockAutoReconnectWallet.mockResolvedValue({
      success: true,
      publicKey: "GACCOUNT_ACTIVE",
    });

    const { result } = renderHook(() => useWallet({ showToasts: true }));

    await waitFor(() => {
      expect(result.current.publicKey).toBe("GACCOUNT_ACTIVE");
    });

    // Trigger locked error event
    act(() => {
      mockWatcherCallback?.({ error: "Wallet is locked" });
    });

    expect(useAuth.getState().activeWalletPublicKey).toBeNull();
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("locked"));
  });

  it("connects manually and sets active wallet state", async () => {
    mockConnectWallet.mockResolvedValue("GMANUAL_CONNECT_PUBKEY");

    const { result } = renderHook(() => useWallet({ autoReconnect: false }));

    await waitFor(() => {
      expect(result.current.isConnecting).toBe(false);
    });

    let pubKey: string | null = null;
    await act(async () => {
      pubKey = await result.current.connect();
    });

    expect(pubKey).toBe("GMANUAL_CONNECT_PUBKEY");
    expect(result.current.publicKey).toBe("GMANUAL_CONNECT_PUBKEY");
    expect(useAuth.getState().activeWalletPublicKey).toBe("GMANUAL_CONNECT_PUBKEY");
    expect(toast.success).toHaveBeenCalled();
  });

  it("disconnects manually and cleans up state and storage", async () => {
    useAuth.getState().setActiveWalletPublicKey("GSOME_KEY");
    useWalletStore.getState().setConnected(true);

    const { result } = renderHook(() => useWallet({ autoReconnect: false }));

    await waitFor(() => {
      expect(result.current.isConnecting).toBe(false);
    });

    act(() => {
      result.current.disconnect();
    });

    expect(useAuth.getState().activeWalletPublicKey).toBeNull();
    expect(useWalletStore.getState().isConnected).toBe(false);
    expect(toast.info).toHaveBeenCalledWith("Freighter wallet disconnected.");
  });
});
