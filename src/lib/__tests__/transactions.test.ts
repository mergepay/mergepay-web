/**
 * Issue #354 — settlement transaction helpers.
 *
 * Builder/inspector tests run against mock Stellar SDK objects (so they pin
 * exactly what we ask the SDK to do), plus one round trip through the real
 * SDK to prove the MP: memo survives XDR encoding.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  SettlementAbortedError,
  SettlementTimeoutError,
  SettlementVerificationError,
  buildSettlementPaymentXdr,
  classifySettlementError,
  formatSettlementMemo,
  inspectSettlementXdr,
  isSettlementMemo,
  verifySettledMemo,
  verifySettlementEnvelope,
  waitForSettlementConfirmation,
  withDeadline,
  type SettlementEnvelope,
  type StellarSdkLike,
  type TransactionLike,
} from "../stellar/transactions";
import type { Settlement } from "../types";

// `src/types/declarations.d.ts` shims the SDK types without these members.
const { Keypair, Networks } = StellarSdk as unknown as {
  Keypair: { random(): { publicKey(): string } };
  Networks: { TESTNET: string };
};

// ---------------------------------------------------------------------------
// Mock SDK
// ---------------------------------------------------------------------------

interface Recorded {
  account?: [string, string];
  options?: { fee: string; networkPassphrase: string };
  operations: unknown[];
  memos: unknown[];
  timeout?: number;
}

function mockSdk(decoded?: TransactionLike): { sdk: StellarSdkLike; recorded: Recorded } {
  const recorded: Recorded = { operations: [], memos: [] };
  class MockAccount {
    constructor(publicKey: string, sequence: string) {
      recorded.account = [publicKey, sequence];
    }
  }
  class MockAsset {
    constructor(public code: string, public issuer: string) {}
    static native() {
      return { native: true };
    }
  }
  class MockBuilder {
    constructor(_source: unknown, options: { fee: string; networkPassphrase: string }) {
      recorded.options = options;
    }
    addOperation(op: unknown) {
      recorded.operations.push(op);
      return this;
    }
    addMemo(memo: unknown) {
      recorded.memos.push(memo);
      return this;
    }
    setTimeout(seconds: number) {
      recorded.timeout = seconds;
      return this;
    }
    build() {
      return { toXDR: () => "MOCK_XDR" };
    }
    static fromXDR(xdr: string, passphrase: string): TransactionLike {
      if (!decoded) throw new Error(`no decode fixture for ${xdr}/${passphrase}`);
      return decoded;
    }
  }
  const sdk = {
    TransactionBuilder: MockBuilder,
    Account: MockAccount,
    Asset: MockAsset,
    Operation: { payment: (opts: unknown) => ({ kind: "payment", ...(opts as object) }) },
    Memo: { text: (value: string) => ({ kind: "text", value }) },
  } as unknown as StellarSdkLike;
  return { sdk, recorded };
}

const SOURCE = "GSOURCE";
const DEST = "GDEST";
const ISSUER = "GISSUER";

// ---------------------------------------------------------------------------
// Memo
// ---------------------------------------------------------------------------

describe("formatSettlementMemo", () => {
  it("prefixes a bare reconciliation code", () => {
    assert.equal(formatSettlementMemo("dinner-1a2b"), "MP:dinner-1a2b");
  });

  it("keeps an existing MP: prefix (any case) without doubling it", () => {
    assert.equal(formatSettlementMemo("MP:dinner-1a2b"), "MP:dinner-1a2b");
    assert.equal(formatSettlementMemo("mp:dinner-1a2b"), "MP:dinner-1a2b");
  });

  it("rejects codes that would not fit or contain spaces", () => {
    assert.throws(() => formatSettlementMemo("x".repeat(26)), SettlementVerificationError);
    assert.throws(() => formatSettlementMemo("has space"), SettlementVerificationError);
    assert.throws(() => formatSettlementMemo("MP:"), SettlementVerificationError);
  });

  it("isSettlementMemo accepts only MP: memos", () => {
    assert.equal(isSettlementMemo("MP:abc"), true);
    assert.equal(isSettlementMemo("abc"), false);
    assert.equal(isSettlementMemo(null), false);
  });
});

// ---------------------------------------------------------------------------
// Builder (mock SDK)
// ---------------------------------------------------------------------------

describe("buildSettlementPaymentXdr", () => {
  it("builds a payment with the MP: memo and the given network", () => {
    const { sdk, recorded } = mockSdk();
    const xdr = buildSettlementPaymentXdr(
      {
        source: { publicKey: SOURCE, sequence: "42" },
        destination: DEST,
        amount: "12.5",
        assetCode: "USDC",
        assetIssuer: ISSUER,
        memo: "rent-0526",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
      sdk
    );
    assert.equal(xdr, "MOCK_XDR");
    assert.deepEqual(recorded.account, [SOURCE, "42"]);
    assert.deepEqual(recorded.options, { fee: "100", networkPassphrase: "Test SDF Network ; September 2015" });
    assert.deepEqual(recorded.memos, [{ kind: "text", value: "MP:rent-0526" }]);
    assert.equal(recorded.timeout, 300);
    const [op] = recorded.operations as Array<{ destination: string; amount: string; asset: { code: string; issuer: string } }>;
    assert.equal(op.destination, DEST);
    assert.equal(op.amount, "12.5");
    assert.equal(op.asset.code, "USDC");
    assert.equal(op.asset.issuer, ISSUER);
  });

  it("uses the native asset for XLM", () => {
    const { sdk, recorded } = mockSdk();
    buildSettlementPaymentXdr(
      {
        source: { publicKey: SOURCE, sequence: "1" },
        destination: DEST,
        amount: "1",
        assetCode: "XLM",
        assetIssuer: null,
        memo: "MP:x",
        networkPassphrase: "net",
        fee: "200",
        timeoutSeconds: 60,
      },
      sdk
    );
    const [op] = recorded.operations as Array<{ asset: unknown }>;
    assert.deepEqual(op.asset, { native: true });
    assert.equal(recorded.options?.fee, "200");
    assert.equal(recorded.timeout, 60);
  });

  it("refuses to build without a valid memo", () => {
    const { sdk, recorded } = mockSdk();
    assert.throws(
      () =>
        buildSettlementPaymentXdr(
          { source: { publicKey: SOURCE, sequence: "1" }, destination: DEST, amount: "1", assetCode: "XLM", assetIssuer: null, memo: "bad memo!", networkPassphrase: "net" },
          sdk
        ),
      SettlementVerificationError
    );
    assert.equal(recorded.operations.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Inspector (mock SDK)
// ---------------------------------------------------------------------------

describe("inspectSettlementXdr", () => {
  it("reads a text memo stored as bytes and the payment details", () => {
    const { sdk } = mockSdk({
      source: SOURCE,
      memo: { type: "text", value: new TextEncoder().encode("MP:rent-0526") },
      operations: [
        { type: "payment", destination: DEST, amount: "12.5000000", asset: { code: "USDC", issuer: ISSUER, isNative: () => false } },
        { type: "changeTrust" },
      ],
    });
    assert.deepEqual(inspectSettlementXdr("AAAA", "net", sdk), {
      source: SOURCE,
      memoType: "text",
      memo: "MP:rent-0526",
      payments: [{ type: "payment", destination: DEST, amount: "12.5000000", assetCode: "USDC", assetIssuer: ISSUER }],
    });
  });

  it("unwraps fee-bump transactions and reads path payment destinations", () => {
    const { sdk } = mockSdk({
      operations: [],
      innerTransaction: {
        memo: { type: "text", value: "MP:x" },
        operations: [
          { type: "pathPaymentStrictReceive", destination: DEST, destAmount: "5", destAsset: { isNative: () => true } },
        ],
      },
    });
    const env = inspectSettlementXdr("AAAA", "net", sdk);
    assert.equal(env.memo, "MP:x");
    assert.deepEqual(env.payments[0], { type: "pathPaymentStrictReceive", destination: DEST, amount: "5", assetCode: "XLM", assetIssuer: null });
  });

  it("reports no memo for non-text memos", () => {
    const { sdk } = mockSdk({ memo: { type: "id", value: "123" }, operations: [] });
    const env = inspectSettlementXdr("AAAA", "net", sdk);
    assert.equal(env.memo, null);
    assert.equal(env.memoType, "id");
  });
});

// ---------------------------------------------------------------------------
// Real SDK round trip
// ---------------------------------------------------------------------------

describe("buildSettlementPaymentXdr + inspectSettlementXdr (real SDK)", () => {
  it("round-trips the MP: memo and payment through XDR", () => {
    const source = Keypair.random().publicKey();
    const destination = Keypair.random().publicKey();
    const xdr = buildSettlementPaymentXdr({
      source: { publicKey: source, sequence: "100" },
      destination,
      amount: "7.2500000",
      assetCode: "XLM",
      assetIssuer: null,
      memo: "trip-9f3a",
      networkPassphrase: Networks.TESTNET,
    });
    const env = inspectSettlementXdr(xdr, Networks.TESTNET);
    assert.equal(env.memo, "MP:trip-9f3a");
    assert.equal(env.source, source);
    assert.deepEqual(env.payments, [{ type: "payment", destination, amount: "7.2500000", assetCode: "XLM", assetIssuer: null }]);
    verifySettlementEnvelope(env, { memo: "MP:trip-9f3a", destination, amount: "7.25", assetCode: "XLM" });
  });
});

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

describe("verifySettlementEnvelope", () => {
  const envelope: SettlementEnvelope = {
    source: SOURCE,
    memoType: "text",
    memo: "MP:rent-0526",
    payments: [{ type: "payment", destination: DEST, amount: "12.5000000", assetCode: "USDC", assetIssuer: ISSUER }],
  };
  const expected = { memo: "MP:rent-0526", destination: DEST, amount: "12.5", assetCode: "USDC", assetIssuer: ISSUER };
  const issueOf = (fn: () => void) => {
    try {
      fn();
      return null;
    } catch (e) {
      return (e as SettlementVerificationError).issue;
    }
  };

  it("passes a matching envelope", () => {
    assert.doesNotThrow(() => verifySettlementEnvelope(envelope, expected));
  });

  it("flags each kind of mismatch", () => {
    assert.equal(issueOf(() => verifySettlementEnvelope(envelope, { ...expected, memo: "rent" })), "memo_malformed");
    assert.equal(issueOf(() => verifySettlementEnvelope({ ...envelope, memo: null }, expected)), "memo_missing");
    assert.equal(issueOf(() => verifySettlementEnvelope({ ...envelope, memo: "MP:other" }, expected)), "memo_mismatch");
    assert.equal(issueOf(() => verifySettlementEnvelope({ ...envelope, payments: [] }, expected)), "no_payment");
    assert.equal(issueOf(() => verifySettlementEnvelope(envelope, { ...expected, destination: "GELSE" })), "destination_mismatch");
    assert.equal(issueOf(() => verifySettlementEnvelope(envelope, { ...expected, assetCode: "XLM" })), "asset_mismatch");
    assert.equal(issueOf(() => verifySettlementEnvelope(envelope, { ...expected, assetIssuer: "GFAKE" })), "asset_mismatch");
    assert.equal(issueOf(() => verifySettlementEnvelope(envelope, { ...expected, amount: "12.5000001" })), "amount_mismatch");
  });

  it("skips optional checks that were not requested", () => {
    assert.doesNotThrow(() => verifySettlementEnvelope(envelope, { memo: "MP:rent-0526" }));
  });
});

describe("verifySettledMemo", () => {
  it("accepts the matching memo and rejects anything else", () => {
    assert.doesNotThrow(() => verifySettledMemo({ memo: "MP:a" }, "MP:a"));
    assert.throws(() => verifySettledMemo({ memo: null }, "MP:a"), /no MP: memo/);
    assert.throws(() => verifySettledMemo({ memo: "MP:b" }, "MP:a"), /expected "MP:a"/);
  });
});

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

describe("withDeadline", () => {
  it("resolves with the promise value", async () => {
    assert.equal(await withDeadline(Promise.resolve(7), 1000), 7);
  });

  it("rejects with SettlementTimeoutError when the deadline passes", async () => {
    await assert.rejects(withDeadline(new Promise(() => undefined), 5, undefined, "too slow"), (e: unknown) => {
      assert.ok(e instanceof SettlementTimeoutError);
      assert.equal((e as Error).message, "too slow");
      return true;
    });
  });

  it("rejects immediately when aborted", async () => {
    const controller = new AbortController();
    const pending = withDeadline(new Promise(() => undefined), 10_000, controller.signal);
    controller.abort();
    await assert.rejects(pending, SettlementAbortedError);
    await assert.rejects(withDeadline(Promise.resolve(1), 10, controller.signal), SettlementAbortedError);
  });
});

function settlement(status: Settlement["status"]): Settlement {
  return { id: "stl-1", status, memo: "MP:a" } as Settlement;
}

describe("waitForSettlementConfirmation", () => {
  it("polls until the settlement is confirmed", async () => {
    const statuses: Settlement["status"][] = ["submitted", "submitted", "confirmed"];
    let calls = 0;
    const seen: string[] = [];
    const result = await waitForSettlementConfirmation({
      settlementId: "stl-1",
      fetchSettlement: async () => settlement(statuses[calls++]),
      intervalMs: 1,
      onUpdate: (s) => seen.push(s.status),
    });
    assert.equal(result.status, "confirmed");
    assert.deepEqual(seen, ["submitted", "submitted", "confirmed"]);
  });

  it("returns a failed settlement instead of polling forever", async () => {
    const result = await waitForSettlementConfirmation({
      settlementId: "stl-1",
      fetchSettlement: async () => settlement("failed"),
      intervalMs: 1,
    });
    assert.equal(result.status, "failed");
  });

  it("retries transient errors", async () => {
    let calls = 0;
    const result = await waitForSettlementConfirmation({
      settlementId: "stl-1",
      fetchSettlement: async () => {
        calls++;
        if (calls < 3) throw new TypeError("fetch failed");
        return settlement("confirmed");
      },
      intervalMs: 1,
    });
    assert.equal(result.status, "confirmed");
    assert.equal(calls, 3);
  });

  it("times out when the network never confirms", async () => {
    await assert.rejects(
      waitForSettlementConfirmation({
        settlementId: "stl-1",
        fetchSettlement: async () => settlement("submitted"),
        intervalMs: 2,
        timeoutMs: 15,
      }),
      SettlementTimeoutError
    );
  });

  it("stops polling when aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    const pending = waitForSettlementConfirmation({
      settlementId: "stl-1",
      fetchSettlement: async () => {
        calls++;
        return settlement("submitted");
      },
      signal: controller.signal,
      intervalMs: 5,
    });
    setTimeout(() => controller.abort(), 12);
    await assert.rejects(pending, SettlementAbortedError);
    const after = calls;
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, after);
  });
});

describe("classifySettlementError", () => {
  it("recognizes a wallet rejection by its code", () => {
    const e = Object.assign(new Error("User declined"), { code: "user_rejected" });
    assert.equal(classifySettlementError(e).kind, "rejected");
  });

  it("classifies timeouts, verification, aborts and network errors", () => {
    assert.equal(classifySettlementError(new SettlementTimeoutError()).kind, "timeout");
    assert.equal(classifySettlementError(new SettlementVerificationError("memo_mismatch", "x")).kind, "verification");
    assert.equal(classifySettlementError(new SettlementAbortedError()).kind, "aborted");
    assert.equal(classifySettlementError(Object.assign(new Error("offline"), { code: "network" })).kind, "network");
    assert.equal(classifySettlementError(new TypeError("Failed to fetch")).kind, "network");
    assert.equal(classifySettlementError(Object.assign(new Error("rejected on-chain"), { code: "tx_failed" })).kind, "failed");
  });

  it("falls back to a generic message", () => {
    const c = classifySettlementError("boom");
    assert.equal(c.kind, "unknown");
    assert.ok(c.message.length > 0);
  });
});
