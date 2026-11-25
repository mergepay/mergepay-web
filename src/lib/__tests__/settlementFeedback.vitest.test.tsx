// Final-result feedback for settlements (issue #609): the failure toasts, the
// error classification they rely on, and the polling window of
// `useSettlementStatus`.
//
// `.vitest.test.tsx` keeps this out of the `tsx --test src/lib/__tests__/*.test.ts`
// glob that `npm test` also runs (see balanceCalculation.vitest.test.tsx).
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";
import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/errorHandler";
import {
  SETTLEMENT_POLL_INTERVAL_MS,
  SETTLEMENT_POLL_MAX_DURATION_MS,
  SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES,
  settlementPollInterval,
  useSettlementStatus,
} from "@/lib/queries";
import {
  SETTLEMENT_FAILURE_TOAST_ID,
  notifySettlementFailure,
  notifySettlementStatusUnknown,
  settlementFailureToast,
} from "@/lib/settlementToasts";
import {
  SettlementAbortedError,
  SettlementTimeoutError,
  SettlementVerificationError,
  classifySettlementError,
  type ClassifiedSettlementError,
} from "@/lib/stellar/transactions";
import type { Settlement } from "@/lib/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, getSettlement: vi.fn() } };
});

const classified = (kind: ClassifiedSettlementError["kind"]): ClassifiedSettlementError => ({
  kind,
  title: `title-${kind}`,
  message: `message-${kind}`,
});

// ---------------------------------------------------------------------------
// settlementFailureToast
// ---------------------------------------------------------------------------

describe("settlementFailureToast", () => {
  it("says nothing about a cancelled attempt", () => {
    expect(settlementFailureToast(classified("aborted"))).toBeNull();
  });

  it("warns, not errors, when the user declined or the wait ran out", () => {
    expect(settlementFailureToast(classified("rejected"))?.level).toBe("warning");
    expect(settlementFailureToast(classified("timeout"))?.level).toBe("warning");
  });

  it("reports a refusal, a mismatch and an unexplained failure as errors", () => {
    for (const kind of ["failed", "verification", "network", "unknown"] as const) {
      expect(settlementFailureToast(classified(kind))?.level).toBe("error");
    }
  });

  it("uses the classified title and message", () => {
    expect(settlementFailureToast(classified("failed"))).toEqual({
      level: "error",
      message: "title-failed",
      description: "message-failed",
    });
  });

  it("warns that a submitted payment may still go through, when that is true", () => {
    for (const kind of ["timeout", "network", "unknown"] as const) {
      const view = settlementFailureToast(classified(kind), { submitted: true });
      expect(view?.description).toBe(
        `message-${kind} Your payment may still go through, so check its status before paying again.`
      );
    }
  });

  it("does not suggest a payment is in flight when it was refused, declined or never sent", () => {
    for (const kind of ["failed", "verification", "rejected"] as const) {
      expect(settlementFailureToast(classified(kind), { submitted: true })?.description).toBe(`message-${kind}`);
    }
    expect(settlementFailureToast(classified("timeout"), { submitted: false })?.description).toBe("message-timeout");
    expect(settlementFailureToast(classified("timeout"))?.description).toBe("message-timeout");
  });
});

describe("notifySettlementFailure / notifySettlementStatusUnknown", () => {
  afterEach(() => vi.clearAllMocks());

  it("raises the toast at the right level with one shared id", () => {
    notifySettlementFailure(classified("rejected"));
    expect(toast.warning).toHaveBeenCalledWith(
      "title-rejected",
      expect.objectContaining({ description: "message-rejected", id: SETTLEMENT_FAILURE_TOAST_ID })
    );

    notifySettlementFailure(classified("failed"));
    expect(toast.error).toHaveBeenCalledWith(
      "title-failed",
      expect.objectContaining({ description: "message-failed", id: SETTLEMENT_FAILURE_TOAST_ID })
    );
  });

  it("raises nothing for a cancelled attempt", () => {
    notifySettlementFailure(classified("aborted"));
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("tells the user a stalled or timed-out status check may still end in a payment", () => {
    notifySettlementStatusUnknown("stalled");
    expect(toast.warning).toHaveBeenLastCalledWith(
      "Couldn't check the payment status",
      expect.objectContaining({ id: SETTLEMENT_FAILURE_TOAST_ID, description: expect.stringContaining("may still be processing") })
    );

    notifySettlementStatusUnknown("timed_out");
    expect(toast.warning).toHaveBeenLastCalledWith(
      "Still waiting for confirmation",
      expect.objectContaining({ id: SETTLEMENT_FAILURE_TOAST_ID, description: expect.stringContaining("may still confirm") })
    );
  });
});

// ---------------------------------------------------------------------------
// classifySettlementError: API errors are not wallet errors
// ---------------------------------------------------------------------------

describe("classifySettlementError", () => {
  it("does not report an API error as a wallet error", () => {
    const failure = classifySettlementError(new ApiRequestError(502, "UPSTREAM", "The settlement could not be confirmed"));

    expect(failure).toEqual({
      kind: "unknown",
      title: "Settlement failed",
      message: "The settlement could not be confirmed",
    });
  });

  it("reports a request that never reached the server as a network error", () => {
    expect(classifySettlementError(new ApiRequestError(0, "network", "offline"))).toMatchObject({ kind: "network" });
    expect(classifySettlementError(new ApiRequestError(0, "request_failed", "Failed to fetch"))).toMatchObject({
      kind: "network",
      title: "Network error",
    });
  });

  it("still reports other string codes as wallet errors and keeps the specific kinds", () => {
    expect(classifySettlementError(Object.assign(new Error("locked"), { code: "locked" }))).toMatchObject({
      kind: "unknown",
      title: "Wallet error",
    });
    expect(classifySettlementError(Object.assign(new Error("no"), { code: "user_rejected" })).kind).toBe("rejected");
    expect(classifySettlementError(Object.assign(new Error("no"), { code: "tx_failed" })).kind).toBe("failed");
    expect(classifySettlementError(new SettlementTimeoutError()).kind).toBe("timeout");
    expect(classifySettlementError(new SettlementAbortedError()).kind).toBe("aborted");
    expect(classifySettlementError(new SettlementVerificationError("memo_mismatch", "x")).kind).toBe("verification");
  });
});

// ---------------------------------------------------------------------------
// settlementPollInterval
// ---------------------------------------------------------------------------

describe("settlementPollInterval", () => {
  const pending = { state: { data: { status: "submitted" } } };

  it("keeps polling a pending settlement", () => {
    expect(settlementPollInterval(pending)).toBe(SETTLEMENT_POLL_INTERVAL_MS);
  });

  it("stops at a terminal status", () => {
    expect(settlementPollInterval({ state: { data: { status: "confirmed" } } })).toBe(false);
    expect(settlementPollInterval({ state: { data: { status: "failed" } } })).toBe(false);
  });

  it("stops after too many consecutive failures", () => {
    expect(settlementPollInterval({ ...pending, failureCount: SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES - 1 })).toBe(
      SETTLEMENT_POLL_INTERVAL_MS
    );
    expect(settlementPollInterval({ ...pending, failureCount: SETTLEMENT_POLL_MAX_PERSISTENT_FAILURES })).toBe(false);
  });

  it("stops once the polling window has run out", () => {
    expect(settlementPollInterval({ ...pending, timedOut: true })).toBe(false);
    expect(settlementPollInterval({ ...pending, timedOut: false })).toBe(SETTLEMENT_POLL_INTERVAL_MS);
  });
});

// ---------------------------------------------------------------------------
// useSettlementStatus: the polling window
// ---------------------------------------------------------------------------

function settlement(status: Settlement["status"]): Settlement {
  return {
    id: "stl-1",
    groupId: "g1",
    fromUserId: "u1",
    toUserId: "u2",
    amount: "10.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    stellarTxHash: null,
    status,
    memo: "MP:test",
    expenseId: null,
    createdAt: "2026-10-22T10:00:00Z",
  } as Settlement;
}

describe("useSettlementStatus polling window", () => {
  let client: QueryClient;
  const getSettlement = vi.mocked(api.getSettlement);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  /** Move the fake clock and let React Query and React settle. */
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getSettlement.mockResolvedValue({ settlement: settlement("submitted") });
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps polling a pending settlement inside the window", async () => {
    const { result } = renderHook(() => useSettlementStatus("stl-1", true, "g1"), { wrapper });

    await advance(0);
    const first = getSettlement.mock.calls.length;
    await advance(SETTLEMENT_POLL_INTERVAL_MS * 3);

    expect(getSettlement.mock.calls.length).toBeGreaterThan(first);
    expect(result.current.pollingTimedOut).toBe(false);
  });

  it("stops polling and says so once the window has run out", async () => {
    const { result } = renderHook(() => useSettlementStatus("stl-1", true, "g1"), { wrapper });

    await advance(SETTLEMENT_POLL_MAX_DURATION_MS - 1);
    expect(result.current.pollingTimedOut).toBe(false);

    await advance(SETTLEMENT_POLL_INTERVAL_MS + 1);
    expect(result.current.pollingTimedOut).toBe(true);

    const callsAtTimeout = getSettlement.mock.calls.length;
    await advance(SETTLEMENT_POLL_INTERVAL_MS * 5);
    expect(getSettlement.mock.calls.length).toBe(callsAtTimeout);
  });

  it("resumes polling in a fresh window after restartPolling", async () => {
    const { result } = renderHook(() => useSettlementStatus("stl-1", true, "g1"), { wrapper });
    await advance(SETTLEMENT_POLL_MAX_DURATION_MS + SETTLEMENT_POLL_INTERVAL_MS);
    expect(result.current.pollingTimedOut).toBe(true);
    const callsAtTimeout = getSettlement.mock.calls.length;

    await act(async () => {
      result.current.restartPolling();
      await result.current.refetch();
    });
    expect(result.current.pollingTimedOut).toBe(false);

    await advance(SETTLEMENT_POLL_INTERVAL_MS * 2);
    expect(getSettlement.mock.calls.length).toBeGreaterThan(callsAtTimeout + 1);
  });

  it("does not time out while polling is disabled or has no settlement", async () => {
    const disabled = renderHook(() => useSettlementStatus("stl-1", false, "g1"), { wrapper });
    const noId = renderHook(() => useSettlementStatus(null, true, "g1"), { wrapper });

    await advance(SETTLEMENT_POLL_MAX_DURATION_MS * 2);

    expect(disabled.result.current.pollingTimedOut).toBe(false);
    expect(noId.result.current.pollingTimedOut).toBe(false);
    expect(getSettlement).not.toHaveBeenCalled();
  });

  it("stops the clock when the settlement reaches a terminal state", async () => {
    getSettlement.mockResolvedValue({ settlement: settlement("confirmed") });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSettlementStatus("stl-1", enabled, "g1"),
      { wrapper, initialProps: { enabled: true } }
    );
    await advance(0);
    expect(result.current.data?.status).toBe("confirmed");

    // The caller flips `enabled` off at a terminal state; the window must not fire later.
    rerender({ enabled: false });
    await advance(SETTLEMENT_POLL_MAX_DURATION_MS * 2);

    expect(result.current.pollingTimedOut).toBe(false);
  });
});
