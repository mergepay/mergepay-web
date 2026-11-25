import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useFreighter } from "./useFreighter";
import {
  NETWORK_PASSPHRASES,
  NETWORK_LABELS,
  STELLAR_NETWORK,
  EXPECTED_NETWORK_LABEL,
} from "@/lib/constants";

/**
 * The Freighter API is mocked at the module boundary so the hook exercises
 * the real `getNetworkDetails` -> `getWalletNetwork` -> `assertWalletNetwork`
 * chain rather than a stubbed verdict. That is the path that has to be
 * correct: a mismatch detected in a mock but not in the real reader is worth
 * nothing to a user whose Freigher is pointed at testnet.
 */
const getNetworkDetails = vi.fn();
const connectWallet = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@stellar/freighter-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@stellar/freighter-api")>();
  return {
    ...actual,
    isConnected: vi.fn().mockResolvedValue(true),
    requestAccess: vi.fn(),
    getAddress: vi.fn(),
    getNetwork: vi.fn(),
    getNetworkDetails: (...args: unknown[]) => getNetworkDetails(...args),
    signTransaction: vi.fn(),
  };
});

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    connectWallet: (...args: unknown[]) => connectWallet(...args),
  };
});

const ADDRESS = "GABC123456789012345678901234567890123456789012345678901234";

/** A Freighter reading that agrees with this deployment's network. */
function matchingNetwork() {
  return {
    network: NETWORK_LABELS[STELLAR_NETWORK],
    networkPassphrase: NETWORK_PASSPHRASES[STELLAR_NETWORK],
  };
}

/** A Freighter reading from the *other* network. */
function mismatchedNetwork() {
  const other = STELLAR_NETWORK === "public" ? "testnet" : "public";
  return {
    network: NETWORK_LABELS[other],
    networkPassphrase: NETWORK_PASSPHRASES[other],
  };
}

describe("useFreighter — network validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectWallet.mockResolvedValue(ADDRESS);
    getNetworkDetails.mockResolvedValue(matchingNetwork());
  });

  it("connects when the wallet network matches the configured network", async () => {
    const { result } = renderHook(() => useFreighter());

    let address = "";
    await act(async () => {
      address = await result.current.connectWithRetry({ showToasts: true });
    });

    expect(address).toBe(ADDRESS);
    expect(getNetworkDetails).toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("surfaces a mismatch as a network_mismatch error and names both networks", async () => {
    getNetworkDetails.mockResolvedValue(mismatchedNetwork());
    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({ showToasts: true })
      ).rejects.toMatchObject({ code: "network_mismatch" });
    });

    expect(result.current.errorCode).toBe("network_mismatch");
    expect(result.current.error).toMatch(/switch/i);
    expect(result.current.error).toContain(EXPECTED_NETWORK_LABEL);
  });

  it("warns via sonner with actionable switch instructions", async () => {
    getNetworkDetails.mockResolvedValue(mismatchedNetwork());
    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await result.current
        .connectWithRetry({ showToasts: true })
        .catch(() => undefined);
    });

    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.warning).mock.calls[0];
    expect(message).toContain(EXPECTED_NETWORK_LABEL);
    expect(message).toMatch(/Freighter/);
    expect(message).toMatch(/Settings/);
    expect(options?.duration).toBeGreaterThanOrEqual(5000);
    // The mismatch must not also be reported as a generic error toast.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not retry a mismatch — the user has to switch networks first", async () => {
    getNetworkDetails.mockResolvedValue(mismatchedNetwork());
    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await expect(
        result.current.connectWithRetry({
          maxRetries: 3,
          retryDelayMs: 10,
          showToasts: false,
        })
      ).rejects.toMatchObject({ code: "network_mismatch" });
    });

    // A single attempt: retrying cannot change which network Freighter is on.
    expect(connectWallet).toHaveBeenCalledTimes(1);
  });

  it("stays silent about the network when toasts are disabled", async () => {
    getNetworkDetails.mockResolvedValue(mismatchedNetwork());
    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await result.current
        .connectWithRetry({ showToasts: false })
        .catch(() => undefined);
    });

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.errorCode).toBe("network_mismatch");
  });

  it("connects without checking the network when validation is opted out", async () => {
    getNetworkDetails.mockResolvedValue(mismatchedNetwork());
    const { result } = renderHook(() => useFreighter());

    let address = "";
    await act(async () => {
      address = await result.current.connectWithRetry({
        showToasts: true,
        validateNetwork: false,
      });
    });

    expect(address).toBe(ADDRESS);
    expect(getNetworkDetails).not.toHaveBeenCalled();
  });

  it("does not block the connection when the network cannot be read", async () => {
    // Locked wallet, old extension, or an origin the wallet will not talk to:
    // an unreadable network is not evidence of a mismatch.
    getNetworkDetails.mockResolvedValue({ error: "Freighter is locked" });
    const { result } = renderHook(() => useFreighter());

    let address = "";
    await act(async () => {
      address = await result.current.connectWithRetry({ showToasts: true });
    });

    expect(address).toBe(ADDRESS);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("does not block the connection when getNetworkDetails throws", async () => {
    getNetworkDetails.mockRejectedValue(new Error("no response"));
    const { result } = renderHook(() => useFreighter());

    let address = "";
    await act(async () => {
      address = await result.current.connectWithRetry({ showToasts: true });
    });

    expect(address).toBe(ADDRESS);
    expect(result.current.error).toBeNull();
  });

  it("names an unrecognised wallet network rather than rendering a blank", async () => {
    getNetworkDetails.mockResolvedValue({
      network: "FUTURENET",
      networkPassphrase: "Test SDF Future Network ; October 2022",
    });
    const { result } = renderHook(() => useFreighter());

    await act(async () => {
      await result.current
        .connectWithRetry({ showToasts: false })
        .catch(() => undefined);
    });

    expect(result.current.error).toContain("FUTURENET");
    expect(result.current.error).toContain(EXPECTED_NETWORK_LABEL);
  });

  it("guards wallet actions against the same mismatch", async () => {
    getNetworkDetails.mockResolvedValue(mismatchedNetwork());
    const { result } = renderHook(() => useFreighter());
    const action = vi.fn().mockResolvedValue("hash");

    await act(async () => {
      await expect(
        result.current.executeWalletAction(action, { validateNetwork: true })
      ).rejects.toMatchObject({ code: "network_mismatch" });
    });

    expect(action).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("lets wallet actions opt out of a redundant network check", async () => {
    getNetworkDetails.mockResolvedValue(mismatchedNetwork());
    const { result } = renderHook(() => useFreighter());
    const action = vi.fn().mockResolvedValue("hash");

    let hash = "";
    await act(async () => {
      hash = await result.current.executeWalletAction(action, {
        validateNetwork: false,
      });
    });

    expect(hash).toBe("hash");
    expect(action).toHaveBeenCalledTimes(1);
  });
});
