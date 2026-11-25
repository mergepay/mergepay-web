/**
 * Tests for `useTrustlineSubmission` (#545).
 *
 * The hook is the piece that turns "Horizon accepted my transaction" into
 * "the trustline is on-chain", so the tests here are about ordering rather
 * than rendering: what is called, in which sequence, and what the caller is
 * allowed to conclude at each point.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTrustlineSubmission } from "./useTrustlineSubmission";

const { stellar } = vi.hoisted(() => ({
  stellar: { addTrustline: vi.fn(), hasTrustline: vi.fn() },
}));

vi.mock("@/lib/stellar", () => ({
  addTrustline: stellar.addTrustline,
  hasTrustline: stellar.hasTrustline,
}));

const WALLET = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXQK7A";
const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const TX_HASH = "c".repeat(64);
const TARGET = { code: "USDC", issuer: ISSUER };

/** Fast enough to run in a test, slow enough that intermediate states are visible. */
const POLL = { timeoutMs: 40, intervalMs: 5 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderSubmission(
  options: {
    publicKey?: string | null;
    onConfirmed?: (t: { code: string; issuer: string; txHash: string }) => void;
    poll?: { timeoutMs?: number; intervalMs?: number };
  } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useTrustlineSubmission({
        publicKey: options.publicKey === undefined ? WALLET : options.publicKey,
        onConfirmed: options.onConfirmed,
        poll: options.poll ?? POLL,
      }),
    { wrapper }
  );
}

describe("useTrustlineSubmission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    stellar.addTrustline.mockResolvedValue({ txHash: TX_HASH });
    stellar.hasTrustline.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("walks the legs in order and only then confirms", async () => {
    const order: string[] = [];
    stellar.addTrustline.mockImplementation(
      async (_w: string, _c: string, _i: string, onPhase?: (p: string) => void) => {
        onPhase?.("preparing");
        onPhase?.("signing");
        onPhase?.("submitting");
        order.push("signed");
        return { txHash: TX_HASH };
      }
    );
    stellar.hasTrustline.mockImplementation(async () => {
      order.push("probed");
      return true;
    });

    const onConfirmed = vi.fn();
    const { result } = renderSubmission({ onConfirmed });

    act(() => result.current.submit(TARGET));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(order).toEqual(["signed", "probed"]);
    expect(onConfirmed).toHaveBeenCalledWith({
      code: "USDC",
      issuer: ISSUER,
      txHash: TX_HASH,
    });
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.completed).toBe(4);
  });

  it("reports each leg as it starts, and names it for the live region", async () => {
    const gate = deferred<{ txHash: string }>();
    stellar.addTrustline.mockImplementation(
      (_w: string, _c: string, _i: string, onPhase?: (p: string) => void) => {
        onPhase?.("signing");
        return gate.promise;
      }
    );
    const { result } = renderSubmission();

    act(() => result.current.submit(TARGET));

    await waitFor(() => {
      expect(result.current.phase).toBe("signing");
    });
    expect(result.current.label).toMatch(/signature in Freighter/i);
    expect(result.current.completed).toBe(1);
    expect(result.current.busy).toBe(true);
    expect(result.current.failure).toBeNull();

    gate.resolve({ txHash: TX_HASH });
  });

  it("holds the confirm result until the network actually shows the trustline", async () => {
    stellar.hasTrustline.mockResolvedValue(false);
    const onConfirmed = vi.fn();
    // `waitFor` above burns real milliseconds, so this window is wide enough
    // that the deadline is not what decides the outcome.
    const { result } = renderSubmission({
      onConfirmed,
      poll: { timeoutMs: 2_000, intervalMs: 25 },
    });

    act(() => result.current.submit(TARGET));

    // Accepted by Horizon, not yet visible on the account.
    await waitFor(() => {
      expect(result.current.phase).toBe("confirming");
    });
    expect(result.current.txHash).toBe(TX_HASH);
    expect(onConfirmed).not.toHaveBeenCalled();

    await act(async () => {
      stellar.hasTrustline.mockResolvedValue(true);
    });
    await waitFor(() => {
      expect(result.current.phase).toBe("confirmed");
    });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("refuses a second submission while the first is in flight", async () => {
    const gate = deferred<{ txHash: string }>();
    stellar.addTrustline.mockReturnValue(gate.promise);
    const { result } = renderSubmission();

    act(() => {
      result.current.submit(TARGET);
      result.current.submit(TARGET);
    });

    // Two activations, one request: the latch is synchronous, so the second is
    // refused before anything reaches the wallet. (React Query defers the
    // mutationFn itself, so the first call lands a microtask later.)
    await waitFor(() => {
      expect(stellar.addTrustline).toHaveBeenCalledTimes(1);
    });

    gate.resolve({ txHash: TX_HASH });
    await waitFor(() => {
      expect(result.current.phase).toBe("confirmed");
    });
    expect(stellar.addTrustline).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a connected wallet", () => {
    const { result } = renderSubmission({ publicKey: null });
    act(() => result.current.submit(TARGET));
    expect(stellar.addTrustline).not.toHaveBeenCalled();
    expect(result.current.phase).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("turns a slow confirmation into a re-check, never a re-sign", async () => {
    stellar.hasTrustline.mockResolvedValue(false);
    const onConfirmed = vi.fn();
    const { result } = renderSubmission({ onConfirmed });

    act(() => result.current.submit(TARGET));

    await waitFor(() => {
      expect(result.current.failure?.recovery).toBe("check");
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.failure?.code).toBe("unconfirmed");
    // The hash survives, because it is the user's proof of what they signed.
    expect(result.current.failure?.txHash).toBe(TX_HASH);
    expect(result.current.busy).toBe(false);
    expect(onConfirmed).not.toHaveBeenCalled();

    const signedBefore = stellar.addTrustline.mock.calls.length;
    stellar.hasTrustline.mockResolvedValue(true);
    act(() => result.current.checkAgain());

    await waitFor(() => {
      expect(result.current.phase).toBe("confirmed");
    });
    expect(stellar.addTrustline.mock.calls.length).toBe(signedBefore);
  });

  it("maps a wallet failure onto the recovery that fits it", async () => {
    stellar.addTrustline.mockRejectedValue(
      Object.assign(new Error("locked"), { code: "locked" })
    );
    const { result } = renderSubmission();

    act(() => result.current.submit(TARGET));

    await waitFor(() => {
      expect(result.current.failure).not.toBeNull();
    });
    expect(result.current.failure?.recovery).toBe("reconnect");
    expect(result.current.failure?.code).toBe("locked");
    expect(result.current.phase).toBe("failed");
    expect(result.current.busy).toBe(false);
  });

  it("keeps an earlier attempt's hash out of a later failure", async () => {
    stellar.addTrustline.mockResolvedValue({ txHash: TX_HASH });
    stellar.hasTrustline.mockResolvedValue(false);
    const { result } = renderSubmission();

    act(() => result.current.submit(TARGET));
    await waitFor(() => {
      expect(result.current.failure?.recovery).toBe("check");
    });

    // A fresh attempt that dies before anything is submitted has no hash.
    stellar.hasTrustline.mockResolvedValue(true);
    stellar.addTrustline.mockRejectedValue(
      Object.assign(new Error("declined"), { code: "user_rejected" })
    );
    act(() => result.current.submit(TARGET));

    await waitFor(() => {
      expect(result.current.failure?.code).toBe("user_rejected");
    });
    expect(result.current.failure?.txHash).toBeNull();
  });

  it("resets back to a clean slate", async () => {
    const { result } = renderSubmission();
    act(() => result.current.submit(TARGET));
    await waitFor(() => {
      expect(result.current.phase).toBe("confirmed");
    });

    act(() => result.current.reset());
    expect(result.current.phase).toBeNull();
    expect(result.current.target).toBeNull();
    expect(result.current.txHash).toBeNull();
    expect(result.current.failure).toBeNull();
    expect(result.current.label).toBeNull();
  });

  it("stops polling when the surface goes away", async () => {
    stellar.hasTrustline.mockReturnValue(new Promise<boolean>(() => {}));
    const onConfirmed = vi.fn();
    const { result, unmount } = renderSubmission({ onConfirmed });

    act(() => result.current.submit(TARGET));
    await waitFor(() => {
      expect(result.current.phase).toBe("confirming");
    });
    const probesBefore = stellar.hasTrustline.mock.calls.length;

    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(stellar.hasTrustline.mock.calls.length).toBe(probesBefore);
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
