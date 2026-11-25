import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import {
  pollTransactionStatus,
  calculateBackoff,
  TransactionPollingTimeoutError,
  TransactionPollingAbortedError,
  TransactionPollingFailedError,
} from "./transactionStatusPolling";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe("transactionStatusPolling (Vitest)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates exponential backoff progression", () => {
    expect(calculateBackoff(1, 1000, 5000, 2)).toBe(1000);
    expect(calculateBackoff(2, 1000, 5000, 2)).toBe(2000);
    expect(calculateBackoff(3, 1000, 5000, 2)).toBe(4000);
    expect(calculateBackoff(4, 1000, 5000, 2)).toBe(5000); // capped at max
  });

  it("shows success toast on confirmed transaction", async () => {
    const probe = vi.fn().mockResolvedValue({
      status: "success",
      txHash: "mockHash",
      ledger: 12345,
    });

    const result = await pollTransactionStatus({
      txHash: "mockHash",
      initialIntervalMs: 5,
      timeoutMs: 500,
      notifyUser: true,
      customProbe: probe,
    });

    expect(result.status).toBe("success");
    expect(result.ledger).toBe(12345);
    expect(toast.success).toHaveBeenCalledWith("Transaction confirmed on Stellar ledger.");
  });

  it("shows error toast on failed transaction", async () => {
    const probe = vi.fn().mockResolvedValue({
      status: "failed",
      txHash: "mockHash",
      error: "op_underfunded",
    });

    await expect(
      pollTransactionStatus({
        txHash: "mockHash",
        initialIntervalMs: 5,
        timeoutMs: 500,
        notifyUser: true,
        customProbe: probe,
      })
    ).rejects.toThrow(TransactionPollingFailedError);

    expect(toast.error).toHaveBeenCalledWith("op_underfunded");
  });

  it("shows warning toast on timeout", async () => {
    const probe = vi.fn().mockResolvedValue({
      status: "pending",
      txHash: "mockHash",
    });

    await expect(
      pollTransactionStatus({
        txHash: "mockHash",
        initialIntervalMs: 20,
        timeoutMs: 50,
        notifyUser: true,
        customProbe: probe,
      })
    ).rejects.toThrow(TransactionPollingTimeoutError);

    expect(toast.warning).toHaveBeenCalled();
  });

  it("does not call toast when notifyUser is false", async () => {
    const probe = vi.fn().mockResolvedValue({
      status: "success",
      txHash: "mockHash",
      ledger: 100,
    });

    await pollTransactionStatus({
      txHash: "mockHash",
      initialIntervalMs: 5,
      timeoutMs: 500,
      notifyUser: false,
      customProbe: probe,
    });

    expect(toast.success).not.toHaveBeenCalled();
  });

  it("aborts cleanly with AbortSignal without notifying toast", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      pollTransactionStatus({
        txHash: "mockHash",
        initialIntervalMs: 5,
        timeoutMs: 500,
        signal: controller.signal,
        notifyUser: true,
      })
    ).rejects.toThrow(TransactionPollingAbortedError);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
