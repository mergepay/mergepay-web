import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHorizonConfirmationFallback } from "../useHorizonConfirmationFallback";
import type { TransactionStatusResponse } from "@/lib/transactionStatusPolling";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const HASH = "f".repeat(64);

/** A Horizon stand-in that answers each probe from a script. */
function scriptedProbe(script: Array<TransactionStatusResponse["status"] | TransactionStatusResponse>) {
  let call = 0;
  return vi.fn(async (txHash: string): Promise<TransactionStatusResponse> => {
    const step = script[Math.min(call, script.length - 1)];
    call += 1;
    return typeof step === "string" ? { status: step, txHash } : step;
  });
}

/** Advance fake time in small slices so awaited probes resolve between timers. */
async function advance(ms: number, slice = 250) {
  for (let elapsed = 0; elapsed < ms; elapsed += slice) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(slice);
    });
  }
}

const fast = { graceMs: 1000, initialIntervalMs: 500, maxIntervalMs: 2000, timeoutMs: 10_000 };

describe("useHorizonConfirmationFallback (#814)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Jitter would make the backoff schedule non-deterministic.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stays idle and never touches Horizon without a hash or while disabled", async () => {
    const probe = scriptedProbe(["success"]);
    const { result, rerender } = renderHook((props) => useHorizonConfirmationFallback(props), {
      initialProps: { txHash: null as string | null, enabled: true, probe, ...fast },
    });
    await advance(3000);
    expect(result.current.state.status).toBe("idle");

    rerender({ txHash: HASH, enabled: false, probe, ...fast });
    await advance(3000);
    expect(result.current.state.status).toBe("idle");
    expect(probe).not.toHaveBeenCalled();
  });

  it("gives the API a grace period before the first Horizon probe", async () => {
    const probe = scriptedProbe(["pending"]);
    renderHook(() => useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast }));

    await advance(750);
    expect(probe).not.toHaveBeenCalled();
    await advance(500);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(HASH, expect.any(AbortSignal));
  });

  it("keeps polling through Horizon delays (404 pending) and resolves on ledger inclusion", async () => {
    const probe = scriptedProbe([
      "pending",
      "pending",
      "pending",
      { status: "success", txHash: HASH, ledger: 4242 },
    ]);
    const { result } = renderHook(() =>
      useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast })
    );

    await advance(1250);
    expect(result.current.state.status).toBe("polling");

    await advance(6000);
    expect(result.current.state).toMatchObject({ status: "confirmed", ledger: 4242, attempts: 4 });
    expect(probe).toHaveBeenCalledTimes(4);
  });

  it("backs off exponentially between probes", async () => {
    const probe = scriptedProbe(["pending"]);
    renderHook(() => useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast }));

    await advance(1000, 50); // grace
    const callTimes: number[] = [];
    probe.mockImplementation(async (txHash: string) => {
      callTimes.push(Date.now());
      return { status: "pending", txHash };
    });
    await advance(8000, 50);
    const gaps = callTimes.slice(1).map((t, i) => t - callTimes[i]);
    // Attempt n waits initial × 1.5^(n-1), capped at 2000 (jitter neutralised).
    // The first recorded gap is attempt 2's: 750 → 1125 → 1688 → 2000 (cap).
    expect(gaps.slice(0, 4)).toEqual([750, 1125, 1688, 2000]);
  });

  it("reports a transaction Horizon marks unsuccessful as failed", async () => {
    const probe = scriptedProbe([
      "pending",
      { status: "failed", txHash: HASH, error: "tx_bad_seq" },
    ]);
    const { result } = renderHook(() =>
      useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast })
    );

    await advance(3000);
    expect(result.current.state).toMatchObject({ status: "failed", error: "tx_bad_seq" });
  });

  it("times out when Horizon never sees the transaction", async () => {
    const probe = scriptedProbe(["pending"]);
    const { result } = renderHook(() =>
      useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast })
    );

    await advance(12_000, 500);
    expect(result.current.state.status).toBe("timed_out");
    const attempts = probe.mock.calls.length;
    await advance(10_000, 500);
    // A timed-out window stops probing.
    expect(probe).toHaveBeenCalledTimes(attempts);
  });

  it("keeps going through transient probe errors (network hiccups)", async () => {
    let call = 0;
    const probe = vi.fn(async (txHash: string): Promise<TransactionStatusResponse> => {
      call += 1;
      if (call < 3) throw new TypeError("Failed to fetch");
      return { status: "success", txHash, ledger: 7 };
    });
    const { result } = renderHook(() =>
      useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast })
    );

    await advance(5000);
    expect(result.current.state).toMatchObject({ status: "confirmed", ledger: 7 });
  });

  it("waits out Horizon's Retry-After on a rate limit before probing again", async () => {
    const callTimes: number[] = [];
    let call = 0;
    const probe = vi.fn(async (txHash: string): Promise<TransactionStatusResponse> => {
      callTimes.push(Date.now());
      call += 1;
      if (call === 1) return { status: "pending", txHash, retryAfterMs: 5000, error: "429" };
      return { status: "success", txHash };
    });
    const { result } = renderHook(() =>
      useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast })
    );

    await advance(8000, 100);
    expect(result.current.state.status).toBe("confirmed");
    // The backoff alone would have probed again after 500ms.
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(5000);
  });

  it("aborts the in-flight poll when disabled (the API answered first)", async () => {
    const probe = scriptedProbe(["pending"]);
    const { result, rerender } = renderHook((props) => useHorizonConfirmationFallback(props), {
      initialProps: { txHash: HASH, enabled: true, probe, ...fast },
    });
    await advance(2000);
    const calls = probe.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    rerender({ txHash: HASH, enabled: false, probe, ...fast });
    await advance(10_000, 500);
    expect(probe).toHaveBeenCalledTimes(calls);
    expect(result.current.state.status).toBe("polling");
  });

  it("restart() opens a fresh window immediately, skipping the grace period", async () => {
    const probe = scriptedProbe(["pending"]);
    const { result } = renderHook(() =>
      useHorizonConfirmationFallback({ txHash: HASH, enabled: true, probe, ...fast, timeoutMs: 2000 })
    );
    await advance(4000);
    expect(result.current.state.status).toBe("timed_out");

    probe.mockClear();
    probe.mockResolvedValue({ status: "success", txHash: HASH, ledger: 9 });
    act(() => result.current.restart());
    await advance(250);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ status: "confirmed", ledger: 9 });
  });
});
