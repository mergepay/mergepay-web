import { describe, expect, it, vi } from "vitest";
import {
  computePollBackoffDelay,
  pollSettlementTransactionStatus,
} from "./settlementStatusPoller";

describe("settlementStatusPoller", () => {
  it("computes exponential backoff capped at maxDelayMs", () => {
    expect(computePollBackoffDelay(0, 500, 5000, 2)).toBe(500);
    expect(computePollBackoffDelay(1, 500, 5000, 2)).toBe(1000);
    expect(computePollBackoffDelay(2, 500, 5000, 2)).toBe(2000);
    expect(computePollBackoffDelay(5, 500, 5000, 2)).toBe(5000);
  });

  it("resolves confirmed status once ledger inclusion succeeds", async () => {
    const checkStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: "pending" as const })
      .mockResolvedValueOnce({ status: "confirmed" as const, ledger: 512340 });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const res = await pollSettlementTransactionStatus({
      txHash: "abc123stellarhash",
      checkStatus,
      sleep,
      initialDelayMs: 250,
    });

    expect(res).toEqual({
      txHash: "abc123stellarhash",
      status: "confirmed",
      ledger: 512340,
      attempts: 2,
    });
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("returns failed immediately on terminal ledger rejection", async () => {
    const checkStatus = vi.fn().mockResolvedValue({
      status: "failed" as const,
      errorMessage: "tx_bad_seq",
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const res = await pollSettlementTransactionStatus({
      txHash: "badseqhash",
      checkStatus,
      sleep,
    });

    expect(res.status).toBe("failed");
    expect(res.errorMessage).toBe("tx_bad_seq");
    expect(res.attempts).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("recovers from transient RPC errors and times out after maxAttempts", async () => {
    const checkStatus = vi.fn().mockRejectedValue(new Error("Horizon 503"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const res = await pollSettlementTransactionStatus({
      txHash: "transienthash",
      checkStatus,
      maxAttempts: 3,
      sleep,
    });

    expect(res.status).toBe("timeout");
    expect(res.attempts).toBe(3);
    expect(res.errorMessage).toContain("Horizon 503");
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
