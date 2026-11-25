import { describe, expect, it, vi, beforeEach } from "vitest";
import * as freighterApi from "@stellar/freighter-api";
import { connectWallet, loginWithWallet, WalletNotInstalledError, WalletLockedError } from "../stellar";
import { useAuth as useAuthStore } from "../auth-store";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    authChallenge: vi.fn(),
    authVerify: vi.fn(),
  },
}));

describe("Freighter connection error handling & retry state (#716)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clear();
    useAuthStore.getState().clearWalletError();
    sessionStorage.clear();
  });

  it("sets walletError in auth store when Freighter is not installed in connectWallet", async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

    await expect(connectWallet()).rejects.toThrow(WalletNotInstalledError);

    const error = useAuthStore.getState().walletError;
    expect(error).not.toBeNull();
    expect(error?.code).toBe("not_installed");
    expect(error?.message).toMatch(/Freighter extension not found/i);
  });

  it("sets walletError in auth store when requestAccess returns locked error", async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.requestAccess).mockResolvedValue({
      address: "",
      error: "Your Freighter wallet is locked. Please unlock it and try again.",
    });

    await expect(connectWallet()).rejects.toThrow(WalletLockedError);

    const error = useAuthStore.getState().walletError;
    expect(error).not.toBeNull();
    expect(error?.code).toBe("locked");
  });

  it("clears walletError in auth store when connectWallet succeeds", async () => {
    useAuthStore.getState().setWalletError({
      code: "locked",
      message: "Previously locked",
    });

    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.requestAccess).mockResolvedValue({
      address: "GABC1234567890123456789012345678901234567890123456789012",
    });

    const pk = await connectWallet();
    expect(pk).toBe("GABC1234567890123456789012345678901234567890123456789012");
    expect(useAuthStore.getState().walletError).toBeNull();
  });

  it("detects missing extension before login flow in loginWithWallet", async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

    await expect(loginWithWallet()).rejects.toThrow(WalletNotInstalledError);

    const error = useAuthStore.getState().walletError;
    expect(error).not.toBeNull();
    expect(error?.code).toBe("not_installed");
  });
});
