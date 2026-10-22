import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateBackoff,
  defaultHorizonProbe,
  pollTransactionStatus,
  TransactionPollingTimeoutError,
  TransactionPollingAbortedError,
  TransactionPollingFailedError,
  type TransactionStatusResponse,
} from "../transactionStatusPolling";

describe("Transaction Status Polling Suite (#636)", () => {
  describe("calculateBackoff", () => {
    it("returns initialIntervalMs for attempt 1 or less", () => {
      assert.equal(calculateBackoff(1, 1000, 8000, 2), 1000);
      assert.equal(calculateBackoff(0, 1000, 8000, 2), 1000);
    });

    it("scales exponentially based on backoff multiplier", () => {
      assert.equal(calculateBackoff(2, 1000, 8000, 2), 2000);
      assert.equal(calculateBackoff(3, 1000, 8000, 2), 4000);
      assert.equal(calculateBackoff(4, 1000, 8000, 2), 8000);
    });

    it("caps backoff interval at maxIntervalMs", () => {
      assert.equal(calculateBackoff(5, 1000, 8000, 2), 8000);
      assert.equal(calculateBackoff(10, 1000, 8000, 2), 8000);
    });

    it("supports fractional multipliers (e.g. 1.5)", () => {
      assert.equal(calculateBackoff(2, 1000, 8000, 1.5), 1500);
      assert.equal(calculateBackoff(3, 1000, 8000, 1.5), 2250);
    });

    it("applies jitter within +/- 15% range", () => {
      const base = 2000;
      for (let i = 0; i < 20; i++) {
        const withJitter = calculateBackoff(2, 1000, 8000, 2, true);
        assert.ok(withJitter >= base * 0.85);
        assert.ok(withJitter <= base * 1.15);
      }
    });
  });

  describe("defaultHorizonProbe", () => {
    const originalFetch = globalThis.fetch;

    it("returns success when Horizon returns 200 and successful=true", async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            successful: true,
            ledger: 54321,
            envelope_xdr: "AAAA...",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      try {
        const result = await defaultHorizonProbe("tx123", "https://horizon.stellar.org");
        assert.equal(result.status, "success");
        assert.equal(result.ledger, 54321);
        assert.equal(result.txHash, "tx123");
        assert.equal(result.envelopeXdr, "AAAA...");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns failed when Horizon returns 200 with successful=false", async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            successful: false,
            ledger: 54322,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      try {
        const result = await defaultHorizonProbe("txFail", "https://horizon.stellar.org");
        assert.equal(result.status, "failed");
        assert.ok(result.error?.includes("unsuccessful"));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns pending when Horizon returns 404 (not in ledger yet)", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ title: "Resource Missing" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });

      try {
        const result = await defaultHorizonProbe("txPending", "https://horizon.stellar.org");
        assert.equal(result.status, "pending");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns pending with rate limit warning on 429", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ title: "Rate Limit Exceeded" }), {
          status: 429,
          headers: { "Retry-After": "3", "Content-Type": "application/json" },
        });

      try {
        const result = await defaultHorizonProbe("txRateLimited", "https://horizon.stellar.org");
        assert.equal(result.status, "pending");
        assert.ok(result.error?.includes("429"));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles unexpected status codes gracefully", async () => {
      globalThis.fetch = async () =>
        new Response("Server error", { status: 500 });

      try {
        const result = await defaultHorizonProbe("tx500", "https://horizon.stellar.org");
        assert.equal(result.status, "pending");
        assert.ok(result.error?.includes("500"));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("pollTransactionStatus", () => {
    it("resolves immediately on first attempt when confirmed", async () => {
      const attempts: number[] = [];
      const probe = async (): Promise<TransactionStatusResponse> => ({
        status: "success",
        txHash: "hash1",
        ledger: 100,
      });

      const res = await pollTransactionStatus({
        txHash: "hash1",
        initialIntervalMs: 10,
        timeoutMs: 1000,
        notifyUser: false,
        customProbe: probe,
        onAttempt: (a) => attempts.push(a),
      });

      assert.equal(res.status, "success");
      assert.equal(res.ledger, 100);
      assert.equal(res.attempts, 1);
      assert.deepEqual(attempts, [1]);
    });

    it("polls multiple times until success", async () => {
      let count = 0;
      const statusChanges: string[] = [];

      const probe = async (): Promise<TransactionStatusResponse> => {
        count += 1;
        if (count < 3) {
          return { status: "pending", txHash: "hash2" };
        }
        return { status: "success", txHash: "hash2", ledger: 200 };
      };

      const res = await pollTransactionStatus({
        txHash: "hash2",
        initialIntervalMs: 10,
        backoffMultiplier: 1.2,
        timeoutMs: 2000,
        notifyUser: false,
        customProbe: probe,
        onStatusChange: (s) => statusChanges.push(s),
      });

      assert.equal(res.status, "success");
      assert.equal(res.ledger, 200);
      assert.equal(res.attempts, 3);
      assert.ok(statusChanges.includes("pending"));
      assert.ok(statusChanges.includes("success"));
    });

    it("throws TransactionPollingFailedError when probe returns failed status", async () => {
      let count = 0;
      const probe = async (): Promise<TransactionStatusResponse> => {
        count += 1;
        if (count < 2) {
          return { status: "pending", txHash: "failTx" };
        }
        return { status: "failed", txHash: "failTx", error: "op_underfunded" };
      };

      await assert.rejects(
        pollTransactionStatus({
          txHash: "failTx",
          initialIntervalMs: 10,
          timeoutMs: 1000,
          notifyUser: false,
          customProbe: probe,
        }),
        (err: unknown) => {
          assert.ok(err instanceof TransactionPollingFailedError);
          assert.equal(err.txHash, "failTx");
          assert.equal(err.attempts, 2);
          return true;
        }
      );
    });

    it("survives transient network errors and resumes polling", async () => {
      let count = 0;
      const probe = async (): Promise<TransactionStatusResponse> => {
        count += 1;
        if (count === 1) {
          throw new TypeError("Failed to fetch (offline)");
        }
        if (count === 2) {
          throw new Error("Network timeout");
        }
        return { status: "success", txHash: "txTransient", ledger: 300 };
      };

      const res = await pollTransactionStatus({
        txHash: "txTransient",
        initialIntervalMs: 10,
        timeoutMs: 2000,
        notifyUser: false,
        customProbe: probe,
      });

      assert.equal(res.status, "success");
      assert.equal(res.attempts, 3);
    });

    it("throws TransactionPollingTimeoutError when timeout passes without confirmation", async () => {
      const probe = async (): Promise<TransactionStatusResponse> => ({
        status: "pending",
        txHash: "timeoutTx",
      });

      await assert.rejects(
        pollTransactionStatus({
          txHash: "timeoutTx",
          initialIntervalMs: 20,
          timeoutMs: 60,
          notifyUser: false,
          customProbe: probe,
        }),
        (err: unknown) => {
          assert.ok(err instanceof TransactionPollingTimeoutError);
          assert.equal(err.txHash, "timeoutTx");
          return true;
        }
      );
    });

    it("aborts promptly when AbortSignal triggers", async () => {
      const controller = new AbortController();
      let callCount = 0;

      const probe = async (): Promise<TransactionStatusResponse> => {
        callCount += 1;
        if (callCount === 1) {
          setTimeout(() => controller.abort(), 10);
        }
        return { status: "pending", txHash: "abortTx" };
      };

      await assert.rejects(
        pollTransactionStatus({
          txHash: "abortTx",
          initialIntervalMs: 100,
          timeoutMs: 2000,
          signal: controller.signal,
          notifyUser: false,
          customProbe: probe,
        }),
        (err: unknown) => {
          assert.ok(err instanceof TransactionPollingAbortedError);
          assert.equal(err.txHash, "abortTx");
          return true;
        }
      );
    });
  });
});
