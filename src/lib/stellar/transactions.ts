/**
 * Settlement transaction helpers (#354).
 *
 * The settlement modal never trusts an envelope blindly: before the user is
 * asked to sign, the unsigned XDR the API built is decoded and checked — it
 * must pay the expected recipient, in the expected asset and amount, with the
 * `MP:<code>` memo that ties the payment to its debt. After confirmation the
 * settled record's memo is checked again before the debt is shown as settled.
 *
 * Everything here is framework-free. The Stellar SDK is injected (defaulting
 * to `@stellar/stellar-sdk`) so tests can pass mock SDK objects, and the
 * async helpers take an `AbortSignal` so a closing modal can cancel timers
 * and polling instead of leaking them.
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import { SETTLEMENT_MEMO_PREFIX } from "../constants";
import { buildMergepayMemo, validateMergepayMemo } from "../validations/memo";
import { toStroops } from "../split";
import type { Settlement } from "../types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SettlementTimeoutError extends Error {
  constructor(message = "The request timed out.") {
    super(message);
    this.name = "SettlementTimeoutError";
  }
}

export class SettlementAbortedError extends Error {
  constructor(message = "The settlement was cancelled.") {
    super(message);
    this.name = "SettlementAbortedError";
  }
}

export type PayloadIssue =
  | "memo_missing"
  | "memo_malformed"
  | "memo_mismatch"
  | "no_payment"
  | "destination_mismatch"
  | "asset_mismatch"
  | "amount_mismatch";

/** The envelope or settled record does not match what the user agreed to. */
export class SettlementVerificationError extends Error {
  issue: PayloadIssue;
  constructor(issue: PayloadIssue, message: string) {
    super(message);
    this.name = "SettlementVerificationError";
    this.issue = issue;
  }
}

// ---------------------------------------------------------------------------
// Memo
// ---------------------------------------------------------------------------

/**
 * Normalize a reconciliation code (or an existing memo) into the `MP:<code>`
 * text memo. Throws `SettlementVerificationError` when the result would not
 * be a valid Mergepay memo (bad characters, over 28 bytes, empty code).
 */
export function formatSettlementMemo(codeOrMemo: string): string {
  const trimmed = codeOrMemo.trim();
  const code = trimmed.toUpperCase().startsWith(SETTLEMENT_MEMO_PREFIX.toUpperCase())
    ? trimmed.slice(SETTLEMENT_MEMO_PREFIX.length)
    : trimmed;
  const memo = buildMergepayMemo(code);
  if (!memo) {
    throw new SettlementVerificationError(
      "memo_malformed",
      `"${codeOrMemo}" cannot be used as a settlement memo.`
    );
  }
  return memo;
}

/** True when `memo` is a well-formed `MP:<code>` memo that fits on-chain. */
export function isSettlementMemo(memo: string | null | undefined): memo is string {
  // Unlike an expense memo, a settlement memo is mandatory.
  return validateMergepayMemo(memo, { required: true }).valid;
}

// ---------------------------------------------------------------------------
// SDK surface (injectable for tests)
// ---------------------------------------------------------------------------

export interface AssetLike {
  code?: string;
  issuer?: string;
  isNative?: () => boolean;
}

export interface OperationLike {
  type: string;
  destination?: string;
  amount?: string;
  asset?: AssetLike;
  destAsset?: AssetLike;
  destAmount?: string;
}

export interface MemoLike {
  type: string;
  value: unknown;
}

export interface TransactionLike {
  source?: string;
  memo?: MemoLike;
  operations: OperationLike[];
  innerTransaction?: TransactionLike;
}

export interface StellarSdkLike {
  TransactionBuilder: {
    new (source: unknown, options: { fee: string; networkPassphrase: string }): {
      addOperation(op: unknown): unknown;
      addMemo(memo: unknown): unknown;
      setTimeout(seconds: number): unknown;
      build(): { toXDR(): string };
    };
    fromXDR(xdr: string, networkPassphrase: string): TransactionLike;
  };
  Account: new (publicKey: string, sequence: string) => unknown;
  Asset: { new (code: string, issuer: string): unknown; native(): unknown };
  Operation: { payment(opts: { destination: string; asset: unknown; amount: string }): unknown };
  Memo: { text(value: string): unknown };
}

const defaultSdk = StellarSdk as unknown as StellarSdkLike;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface BuildSettlementPaymentParams {
  source: { publicKey: string; sequence: string };
  destination: string;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  /** Reconciliation code or full `MP:` memo. */
  memo: string;
  networkPassphrase: string;
  fee?: string;
  timeoutSeconds?: number;
}

/**
 * Build an unsigned settlement payment carrying the `MP:` text memo.
 * Mirrors what the API produces, for flows that build client-side (and for
 * testing that the memo lands in the payload).
 */
export function buildSettlementPaymentXdr(
  params: BuildSettlementPaymentParams,
  sdk: StellarSdkLike = defaultSdk
): string {
  const memo = formatSettlementMemo(params.memo);
  const asset =
    params.assetIssuer && params.assetCode.toUpperCase() !== "XLM"
      ? new sdk.Asset(params.assetCode, params.assetIssuer)
      : sdk.Asset.native();
  const builder = new sdk.TransactionBuilder(new sdk.Account(params.source.publicKey, params.source.sequence), {
    fee: params.fee ?? "100",
    networkPassphrase: params.networkPassphrase,
  });
  builder.addOperation(sdk.Operation.payment({ destination: params.destination, asset, amount: params.amount }));
  builder.addMemo(sdk.Memo.text(memo));
  builder.setTimeout(params.timeoutSeconds ?? 300);
  return builder.build().toXDR();
}

// ---------------------------------------------------------------------------
// Inspect & verify
// ---------------------------------------------------------------------------

export interface PaymentSummary {
  type: string;
  destination: string | null;
  amount: string | null;
  assetCode: string;
  assetIssuer: string | null;
}

export interface SettlementEnvelope {
  source: string | null;
  memoType: string;
  /** Text memo, or `null` when the envelope has none / a non-text memo. */
  memo: string | null;
  payments: PaymentSummary[];
}

function memoText(memo: MemoLike | undefined): string | null {
  if (!memo || memo.type !== "text" || memo.value == null) return null;
  const value = memo.value;
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  return String(value);
}

function assetOf(asset: AssetLike | undefined): { code: string; issuer: string | null } {
  if (!asset || asset.isNative?.() || !asset.issuer) return { code: "XLM", issuer: null };
  return { code: asset.code ?? "", issuer: asset.issuer };
}

const PAYMENT_TYPES = new Set(["payment", "pathPaymentStrictReceive", "pathPaymentStrictSend"]);

/** Decode an XDR envelope (fee bumps are unwrapped) into what the user is paying. */
export function inspectSettlementXdr(
  xdr: string,
  networkPassphrase: string,
  sdk: StellarSdkLike = defaultSdk
): SettlementEnvelope {
  const decoded = sdk.TransactionBuilder.fromXDR(xdr, networkPassphrase);
  const tx = decoded.innerTransaction ?? decoded;
  return {
    source: tx.source ?? null,
    memoType: tx.memo?.type ?? "none",
    memo: memoText(tx.memo),
    payments: tx.operations
      .filter((op) => PAYMENT_TYPES.has(op.type))
      .map((op) => {
        const received = op.type === "payment" ? op.asset : op.destAsset;
        const { code, issuer } = assetOf(received);
        return {
          type: op.type,
          destination: op.destination ?? null,
          amount: op.type === "pathPaymentStrictReceive" ? op.destAmount ?? null : op.amount ?? op.destAmount ?? null,
          assetCode: code,
          assetIssuer: issuer,
        };
      }),
  };
}

export interface ExpectedSettlement {
  /** The `MP:` memo the API assigned to this settlement. */
  memo: string | null | undefined;
  destination?: string | null;
  amount?: string | null;
  assetCode?: string | null;
  assetIssuer?: string | null;
}

function sameAmount(a: string, b: string): boolean {
  try {
    return toStroops(a) === toStroops(b);
  } catch {
    return false;
  }
}

/**
 * Check a decoded envelope against the settlement the user reviewed.
 * Throws `SettlementVerificationError` on the first mismatch. Optional
 * fields in `expected` are only checked when provided.
 */
export function verifySettlementEnvelope(envelope: SettlementEnvelope, expected: ExpectedSettlement): void {
  if (!isSettlementMemo(expected.memo)) {
    throw new SettlementVerificationError(
      "memo_malformed",
      "Mergepay did not return a valid MP: reconciliation memo for this settlement."
    );
  }
  if (!envelope.memo) {
    throw new SettlementVerificationError(
      "memo_missing",
      "The payment is missing its MP: memo, so it could not be matched to this debt."
    );
  }
  if (envelope.memo.trim() !== expected.memo.trim()) {
    throw new SettlementVerificationError(
      "memo_mismatch",
      `The payment memo "${envelope.memo}" does not match the expected "${expected.memo}".`
    );
  }

  const payment = expected.destination
    ? envelope.payments.find((p) => p.destination === expected.destination)
    : envelope.payments[0];
  if (envelope.payments.length === 0) {
    throw new SettlementVerificationError("no_payment", "The transaction does not contain a payment.");
  }
  if (!payment) {
    throw new SettlementVerificationError(
      "destination_mismatch",
      "The payment is not addressed to the member you are settling with."
    );
  }
  if (expected.assetCode && payment.assetCode.toUpperCase() !== expected.assetCode.toUpperCase()) {
    throw new SettlementVerificationError(
      "asset_mismatch",
      `The payment is in ${payment.assetCode}, not ${expected.assetCode}.`
    );
  }
  if (expected.assetIssuer && payment.assetIssuer && payment.assetIssuer !== expected.assetIssuer) {
    throw new SettlementVerificationError("asset_mismatch", `The payment uses a different ${payment.assetCode} issuer.`);
  }
  if (expected.amount && payment.amount && !sameAmount(payment.amount, expected.amount)) {
    throw new SettlementVerificationError(
      "amount_mismatch",
      `The payment amount ${payment.amount} does not match ${expected.amount}.`
    );
  }
}

/** Final check before showing a debt as settled: the recorded memo must match. */
export function verifySettledMemo(settlement: Pick<Settlement, "memo">, expectedMemo: string): void {
  if (!settlement.memo) {
    throw new SettlementVerificationError("memo_missing", "The confirmed payment has no MP: memo recorded.");
  }
  if (settlement.memo.trim() !== expectedMemo.trim()) {
    throw new SettlementVerificationError(
      "memo_mismatch",
      `The confirmed payment carries memo "${settlement.memo}", expected "${expectedMemo}".`
    );
  }
}

// ---------------------------------------------------------------------------
// Async helpers — deadlines, abort, polling
// ---------------------------------------------------------------------------

function abortError(signal?: AbortSignal): SettlementAbortedError {
  const reason = signal?.reason;
  return reason instanceof SettlementAbortedError ? reason : new SettlementAbortedError();
}

/**
 * Race `promise` against a deadline and an optional abort signal. The timer
 * and the abort listener are always removed, whichever settles first.
 */
export function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
  timeoutMessage?: string
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new SettlementTimeoutError(timeoutMessage));
    }, timeoutMs);
    const onAbort = () => {
      cleanup();
      reject(abortError(signal));
    };
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return withDeadline(new Promise<never>(() => undefined), ms, signal).catch((e) => {
    if (e instanceof SettlementTimeoutError) return;
    throw e;
  });
}

export interface WaitForConfirmationOptions {
  settlementId: string;
  fetchSettlement: (id: string) => Promise<Settlement>;
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  /** Per-request deadline so one hung request cannot stall the loop. */
  requestTimeoutMs?: number;
  onUpdate?: (settlement: Settlement) => void;
}

/**
 * Poll a settlement until it is `confirmed` or `failed`. Rejects with
 * `SettlementTimeoutError` once `timeoutMs` passes (the payment may still
 * land — callers should offer to check again, never to re-send) and with
 * `SettlementAbortedError` when `signal` aborts. Transient fetch errors are
 * retried until the deadline.
 */
export async function waitForSettlementConfirmation({
  settlementId,
  fetchSettlement,
  signal,
  intervalMs = 2500,
  timeoutMs = 90_000,
  requestTimeoutMs = 15_000,
  onUpdate,
}: WaitForConfirmationOptions): Promise<Settlement> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) throw abortError(signal);
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SettlementTimeoutError("The network did not confirm the payment in time.");
    }
    try {
      const settlement = await withDeadline(
        fetchSettlement(settlementId),
        Math.min(requestTimeoutMs, remaining),
        signal
      );
      onUpdate?.(settlement);
      if (settlement.status === "confirmed" || settlement.status === "failed") return settlement;
    } catch (e) {
      if (e instanceof SettlementAbortedError) throw e;
      // Transient failure or slow request — keep polling until the deadline.
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())), signal);
  }
}

// ---------------------------------------------------------------------------
// Error classification for the UI
// ---------------------------------------------------------------------------

export type SettlementErrorKind = "rejected" | "timeout" | "verification" | "failed" | "network" | "aborted" | "unknown";

export interface ClassifiedSettlementError {
  kind: SettlementErrorKind;
  title: string;
  message: string;
}

/**
 * Map anything thrown during a settlement to copy the modal can show.
 * Wallet errors are recognized by their stable `code` so this module does
 * not need to import the wallet layer.
 */
export function classifySettlementError(error: unknown): ClassifiedSettlementError {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : "";

  if (error instanceof SettlementAbortedError) {
    return { kind: "aborted", title: "Cancelled", message: "The settlement was cancelled. Nothing was submitted." };
  }
  if (code === "user_rejected") {
    return {
      kind: "rejected",
      title: "Signature declined",
      message: "You declined the transaction in Freighter. Nothing was sent — you can try again whenever you're ready.",
    };
  }
  if (error instanceof SettlementTimeoutError) {
    return { kind: "timeout", title: "Timed out", message: message || "The request timed out." };
  }
  if (error instanceof SettlementVerificationError) {
    return { kind: "verification", title: "Payment details don't match", message };
  }
  if (code === "tx_failed") {
    return { kind: "failed", title: "Payment failed", message: message || "Stellar rejected this payment. No funds moved." };
  }
  if (code === "network" || (error instanceof TypeError && /fetch|network/i.test(message))) {
    return { kind: "network", title: "Network error", message: message || "Couldn't reach the network. Check your connection." };
  }
  if (typeof code === "string" && code !== "") {
    return { kind: "unknown", title: "Wallet error", message: message || "The wallet reported an error." };
  }
  return { kind: "unknown", title: "Settlement failed", message: message || "Something went wrong. Please try again." };
}
