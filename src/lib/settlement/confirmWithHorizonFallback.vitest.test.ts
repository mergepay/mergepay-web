import { describe, expect, it, vi } from "vitest";
import { confirmWithHorizonFallback } from "./confirmWithHorizonFallback";
import { SettlementAbortedError, SettlementTimeoutError } from "../stellar/transactions";
import type { TransactionStatusResponse } from "../transactionStatusPolling";
import type { Settlement } from "../types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const HASH = "c".repeat(64);
const pending = { id: "stl-1", memo: "MP:x", status: "submitted", stellarTxHash: null } as unknown as Settlement;
const submitted = () => Promise.resolve({ ...pending });
const probeOf = (status: TransactionStatusResponse["status"]) =>
  vi.fn(async (txHash: string): Promise<TransactionStatusResponse> => ({ status, txHash }));

const base = { settlementId: "stl-1", pending, intervalMs: 5, timeoutMs: 400 };

describe("confirmWithHorizonFallback (#814)", () => {
  it("resolves from the API when it reaches a terminal state", async () => {
    const result = await confirmWithHorizonFallback({
      ...base,
      txHash: HASH,
      fetchSettlement: async () => ({ ...pending, status: "confirmed", stellarTxHash: "api-hash" }),
      horizon: { graceMs: 1000, probe: probeOf("success") },
    });
    expect(result.source).toBe("api");
    expect(result.settlement.stellarTxHash).toBe("api-hash");
  });

  it("resolves from Horizon with the pending record marked confirmed", async () => {
    const onHorizonStart = vi.fn();
    const result = await confirmWithHorizonFallback({
      ...base,
      txHash: HASH,
      fetchSettlement: submitted,
      horizon: { graceMs: 10, initialIntervalMs: 5, probe: probeOf("success") },
      onHorizonStart,
    });
    expect(result).toEqual({
      source: "horizon",
      settlement: { ...pending, status: "confirmed", stellarTxHash: HASH },
    });
    expect(onHorizonStart).toHaveBeenCalledTimes(1);
  });

  it("reports Horizon's unsuccessful verdict as failed", async () => {
    const result = await confirmWithHorizonFallback({
      ...base,
      txHash: HASH,
      fetchSettlement: submitted,
      horizon: { graceMs: 10, probe: probeOf("failed") },
    });
    expect(result.settlement.status).toBe("failed");
  });

  it("only polls the API without a hash, or when the fallback is off", async () => {
    const probe = probeOf("success");
    for (const options of [
      { txHash: null, horizon: { graceMs: 1, probe } },
      { txHash: HASH, horizon: false as const },
    ]) {
      await expect(
        confirmWithHorizonFallback({ ...base, timeoutMs: 60, fetchSettlement: submitted, ...options })
      ).rejects.toBeInstanceOf(SettlementTimeoutError);
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it("skips Horizon when the grace period would outlast the whole budget", async () => {
    const probe = probeOf("success");
    await expect(
      confirmWithHorizonFallback({
        ...base,
        timeoutMs: 50,
        txHash: HASH,
        fetchSettlement: submitted,
        horizon: { graceMs: 100, probe },
      })
    ).rejects.toBeInstanceOf(SettlementTimeoutError);
    expect(probe).not.toHaveBeenCalled();
  });

  it("times out with the API's reason when neither leg has an answer", async () => {
    await expect(
      confirmWithHorizonFallback({
        ...base,
        timeoutMs: 80,
        txHash: HASH,
        fetchSettlement: submitted,
        horizon: { graceMs: 10, initialIntervalMs: 5, probe: probeOf("pending") },
      })
    ).rejects.toBeInstanceOf(SettlementTimeoutError);
  });

  it("stops the losing leg once one answers", async () => {
    const fetchSettlement = vi.fn(submitted);
    await confirmWithHorizonFallback({
      ...base,
      txHash: HASH,
      fetchSettlement,
      horizon: { graceMs: 10, probe: probeOf("success") },
    });
    const calls = fetchSettlement.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(fetchSettlement).toHaveBeenCalledTimes(calls);
  });

  it("rejects with SettlementAbortedError when the caller aborts", async () => {
    const controller = new AbortController();
    const promise = confirmWithHorizonFallback({
      ...base,
      txHash: HASH,
      fetchSettlement: submitted,
      signal: controller.signal,
      horizon: { graceMs: 10, probe: probeOf("pending") },
    });
    setTimeout(() => controller.abort(), 20);
    await expect(promise).rejects.toBeInstanceOf(SettlementAbortedError);
  });
});
