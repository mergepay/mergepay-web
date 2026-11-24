import { afterEach, describe, expect, it, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  DEFAULT_RATE_LIMIT_BACKOFF_MS,
  MAX_RATE_LIMIT_BACKOFF_MS,
  defaultHorizonProbe,
  parseRetryAfterMs,
} from "./transactionStatusPolling";
import { isAmbiguousSubmissionError, SettlementTimeoutError, transactionHashFromXdr } from "./stellar/transactions";
import { ApiRequestError } from "./errorHandler";
import { ApiTimeoutError } from "./api";
import { DEFAULT_HORIZON_URLS } from "./constants";
import { WalletError } from "./stellar";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

describe("parseRetryAfterMs", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfterMs("3")).toBe(3000);
    expect(parseRetryAfterMs(" 1.5 ")).toBe(1500);
    expect(parseRetryAfterMs("0")).toBe(0);
  });

  it("reads an HTTP date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:04 GMT", now)).toBe(4000);
    // A date already in the past means "go ahead now".
    expect(parseRetryAfterMs("Wed, 31 Dec 2025 23:59:00 GMT", now)).toBe(0);
  });

  it("falls back to a default for a missing or garbled header", () => {
    expect(parseRetryAfterMs(null)).toBe(DEFAULT_RATE_LIMIT_BACKOFF_MS);
    expect(parseRetryAfterMs("soon")).toBe(DEFAULT_RATE_LIMIT_BACKOFF_MS);
  });

  it("caps an excessive wait so one header can't stall the poll", () => {
    expect(parseRetryAfterMs("3600")).toBe(MAX_RATE_LIMIT_BACKOFF_MS);
  });
});

describe("defaultHorizonProbe rate limiting", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("surfaces Retry-After from a 429 as retryAfterMs while staying pending", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("{}", { status: 429, headers: { "Retry-After": "7" } })
    ) as typeof fetch;
    const result = await defaultHorizonProbe("abc", "https://horizon.test");
    expect(result).toMatchObject({ status: "pending", retryAfterMs: 7000 });
    expect(result.error).toMatch(/429/);
  });

  it("queries /transactions/{hash} on the given Horizon without a trailing slash", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    globalThis.fetch = fetchMock as typeof fetch;
    await defaultHorizonProbe("abc", "https://horizon.test/");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://horizon.test/transactions/abc",
      expect.objectContaining({ method: "GET" })
    );
  });
});

/**
 * The slice of the real SDK this suite drives. `src/types/declarations.d.ts`
 * shims the package's types down to what app code uses, so the test spells out
 * the extra classes it needs instead of widening that shim.
 */
interface Hashable {
  hash(): { toString(encoding: "hex"): string };
}
interface SdkForTests {
  Keypair: { random(): { publicKey(): string } };
  Networks: { TESTNET: string; PUBLIC: string };
  Account: new (accountId: string, sequence: string) => unknown;
  Asset: { native(): unknown };
  Operation: { payment(opts: { destination: string; asset: unknown; amount: string }): unknown };
  TransactionBuilder: new (
    source: unknown,
    opts: { fee: string; networkPassphrase: string }
  ) => {
    addOperation(op: unknown): ReturnType<SdkForTests["TransactionBuilder"]["prototype"]["setTimeout"]>;
    setTimeout(seconds: number): { build(): Hashable & { sign(kp: unknown): void; toXDR(): string } };
  };
}
const { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } =
  StellarSdk as unknown as SdkForTests;

describe("transactionHashFromXdr", () => {
  function signedEnvelope(passphrase: string) {
    const source = Keypair.random();
    const tx = new TransactionBuilder(new Account(source.publicKey(), "1"), {
      fee: "100",
      networkPassphrase: passphrase,
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: "10",
        })
      )
      .setTimeout(30)
      .build();
    tx.sign(source);
    return { xdr: tx.toXDR(), hash: tx.hash().toString("hex") };
  }

  it("derives the same hash Horizon indexes the transaction under", () => {
    const { xdr, hash } = signedEnvelope(Networks.TESTNET);
    expect(transactionHashFromXdr(xdr, Networks.TESTNET)).toBe(hash);
  });

  it("is network-specific: the same envelope hashes differently per passphrase", () => {
    const { xdr, hash } = signedEnvelope(Networks.TESTNET);
    expect(transactionHashFromXdr(xdr, Networks.PUBLIC)).not.toBe(hash);
  });

  it("returns null instead of throwing for anything that isn't an envelope", () => {
    expect(transactionHashFromXdr("signed-xdr", Networks.TESTNET)).toBeNull();
    expect(transactionHashFromXdr("", Networks.TESTNET)).toBeNull();
    expect(transactionHashFromXdr("AAAA", "")).toBeNull();
  });
});

describe("isAmbiguousSubmissionError", () => {
  it.each([
    ["a dropped connection (status 0)", new ApiRequestError(0, "network", "offline")],
    ["a gateway timeout", new ApiRequestError(504, "GATEWAY_TIMEOUT", "timeout")],
    ["a server error", new ApiRequestError(500, "INTERNAL", "boom")],
    ["a request timeout", new ApiRequestError(408, "TIMEOUT", "slow")],
    ["a client-side timeout", new ApiTimeoutError()],
    ["a settlement deadline", new SettlementTimeoutError()],
    ["a fetch TypeError", new TypeError("Failed to fetch")],
  ])("treats %s as possibly submitted", (_label, error) => {
    expect(isAmbiguousSubmissionError(error)).toBe(true);
  });

  it.each([
    ["a validation error", new ApiRequestError(422, "INVALID", "bad xdr")],
    ["an auth error", new ApiRequestError(401, "UNAUTHORIZED", "expired")],
    ["a conflict", new ApiRequestError(409, "CONFLICT", "already settled")],
    ["a wallet error", new WalletError("locked", "locked")],
    ["a plain Error", new Error("API unavailable")],
    ["nothing", null],
  ])("treats %s as definitely not submitted", (_label, error) => {
    expect(isAmbiguousSubmissionError(error)).toBe(false);
  });
});

describe("DEFAULT_HORIZON_URLS", () => {
  it("points each network at its own Horizon", () => {
    expect(DEFAULT_HORIZON_URLS.testnet).toBe("https://horizon-testnet.stellar.org");
    expect(DEFAULT_HORIZON_URLS.public).toBe("https://horizon.stellar.org");
  });
});
