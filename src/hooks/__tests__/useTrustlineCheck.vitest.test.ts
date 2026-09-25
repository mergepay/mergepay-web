import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrustlineAsset } from "@/lib/trustline";

const { stellar } = vi.hoisted(() => ({
  stellar: {
    isFreighterAvailable: vi.fn(),
    getGrantedAddress: vi.fn(),
    getWalletAssets: vi.fn(),
  },
}));

vi.mock("@/lib/stellar", () => ({
  isFreighterAvailable: stellar.isFreighterAvailable,
  getGrantedAddress: stellar.getGrantedAddress,
  getWalletAssets: stellar.getWalletAssets,
  addTrustline: vi.fn(),
  WalletError: class WalletError extends Error {},
  walletMessage: (code: string) => `message:${code}`,
}));

vi.mock("@stellar/freighter-api", () => ({
  WatchWalletChanges: class {
    watch = vi.fn();
    stop = vi.fn();
  },
}));

import { useTrustlineCheck } from "../useTrustlineCheck";

const ADDRESS = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXQK7A";

function asset(overrides: Partial<TrustlineAsset> = {}): TrustlineAsset {
  return {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    name: "USD Coin",
    balance: "0.0000000",
    hasTrustline: false,
    ...overrides,
  };
}

const XLM = asset({ code: "XLM", issuer: null, name: "Lumen", hasTrustline: true });

describe("useTrustlineCheck", () => {
  beforeEach(() => {
    stellar.isFreighterAvailable.mockResolvedValue(true);
    stellar.getGrantedAddress.mockResolvedValue(ADDRESS);
    stellar.getWalletAssets.mockResolvedValue([XLM]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports disconnected when Freighter is unavailable", async () => {
    stellar.isFreighterAvailable.mockResolvedValue(false);

    const { result } = renderHook(() => useTrustlineCheck());

    await waitFor(() => expect(result.current.status).toBe("disconnected"));
    expect(result.current.address).toBeNull();
    expect(stellar.getWalletAssets).not.toHaveBeenCalled();
  });

  it("reports disconnected when no account is shared", async () => {
    stellar.getGrantedAddress.mockResolvedValue(null);

    const { result } = renderHook(() => useTrustlineCheck());

    await waitFor(() => expect(result.current.status).toBe("disconnected"));
    expect(result.current.address).toBeNull();
  });

  it("reports ready when every configured asset has a trustline", async () => {
    stellar.getWalletAssets.mockResolvedValue([
      XLM,
      asset({ hasTrustline: true }),
    ]);

    const { result } = renderHook(() => useTrustlineCheck());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.missing).toEqual([]);
    expect(result.current.address).toBe(ADDRESS);
    expect(stellar.getWalletAssets).toHaveBeenCalledWith(ADDRESS);
  });

  it("reports missing assets when a trustline is absent", async () => {
    stellar.getWalletAssets.mockResolvedValue([XLM, asset()]);

    const { result } = renderHook(() => useTrustlineCheck());

    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.missing.map((a) => a.code)).toEqual(["USDC"]);
  });

  it("absorbs Horizon failures without throwing", async () => {
    stellar.getWalletAssets.mockRejectedValue(new Error("ECONNREFUSED"));

    const { result } = renderHook(() => useTrustlineCheck());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/couldn't check/i);
  });

  it("re-runs the check when refresh is called", async () => {
    stellar.getWalletAssets.mockResolvedValueOnce([XLM, asset()]);
    stellar.getWalletAssets.mockResolvedValue([XLM, asset({ hasTrustline: true })]);

    const { result } = renderHook(() => useTrustlineCheck());
    await waitFor(() => expect(result.current.status).toBe("missing"));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(stellar.getWalletAssets).toHaveBeenCalledTimes(2);
  });
});
