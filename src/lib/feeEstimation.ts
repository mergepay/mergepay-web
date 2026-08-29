/**
 * Stellar fee estimation (#247).
 *
 * Classic Stellar transactions (payments, changeTrust — everything Mergepay
 * signs) are charged a base fee per operation. The network's minimum is 100
 * stroops per operation, so a settlement with N payment operations costs
 * exactly `100 × N` stroops (0.00001 XLM per operation). Soroban contract
 * calls add a resource fee on top; this module keeps that out of the base
 * math and exposes a `resourceFeeStroops` estimate for callers that want to
 * show it.
 *
 * Everything here is pure and deterministic so the widget and the tests can
 * agree on one number.
 */

import { fromStroops } from "./money";
import {
  currencyRate,
  type SupportedFiatCurrency,
} from "./currency";

/** Stellar's minimum base fee, in stroops, per operation. */
export const STELLAR_BASE_FEE_STROOPS = 100n;

/**
 * Indicative XLM → USD rate for the fiat fee preview. Mirrors
 * `INDICATIVE_XLM_USD` in `src/lib/budgets.ts` and is deliberately
 * overridable — never a settlement quote.
 */
export const INDICATIVE_XLM_USD = 0.5;

export interface FeeEstimate {
  /** Number of payment/trustline operations in the transaction. */
  operationCount: number;
  /** Base fee: 100 stroops × operation count. */
  baseFeeStroops: bigint;
  /** Estimated Soroban resource fee (0 for classic ops by default). */
  resourceFeeStroops: bigint;
  /** Base + resource. */
  totalFeeStroops: bigint;
  /** Total fee as a decimal XLM string, e.g. "0.00001". */
  feeXlm: string;
  /** Rough time to ledger inclusion, in seconds. */
  ledgerEstimateSeconds: number;
}

/**
 * Compute the fee for a transaction with `operationCount` operations.
 * `resourceStroopsPerOp` defaults to 0 because classic ops have no resource
 * fee; pass a value to model Soroban contract calls.
 */
export function estimateStellarFee(
  operationCount: number,
  options: {
    resourceStroopsPerOp?: number;
    ledgerSecondsPerOperation?: number;
  } = {}
): FeeEstimate {
  const count = Math.max(1, Math.floor(operationCount));
  const baseFeeStroops = STELLAR_BASE_FEE_STROOPS * BigInt(count);
  const resourceStroopsPerOp = options.resourceStroopsPerOp ?? 0;
  const resourceFeeStroops =
    resourceStroopsPerOp > 0 ? BigInt(resourceStroopsPerOp) * BigInt(count) : 0n;
  const totalFeeStroops = baseFeeStroops + resourceFeeStroops;

  // Ledgers close every ~5 seconds; large batches can take an extra ledger.
  const perOp = options.ledgerSecondsPerOperation ?? 5;
  const ledgerEstimateSeconds =
    perOp + Math.floor((count - 1) / 10) * perOp;

  return {
    operationCount: count,
    baseFeeStroops,
    resourceFeeStroops,
    totalFeeStroops,
    feeXlm: fromStroops(totalFeeStroops),
    ledgerEstimateSeconds,
  };
}

/**
 * Approximate fiat value of a fee, for display only. XLM is converted to USD
 * at the indicative rate, then USD to the target currency using the shared
 * indicative fiat rates. Returns `null` when the fee can't be read.
 */
export function estimateFiatFee(
  feeXlm: string | number,
  options: {
    xlmUsdRate?: number;
    currency: SupportedFiatCurrency;
  }
): number | null {
  const xlm = typeof feeXlm === "number" ? feeXlm : Number(feeXlm);
  if (!Number.isFinite(xlm) || xlm < 0) return null;

  const xlmUsdRate = options.xlmUsdRate ?? INDICATIVE_XLM_USD;
  if (!Number.isFinite(xlmUsdRate) || xlmUsdRate <= 0) return null;

  const usd = xlm * xlmUsdRate;
  if (options.currency === "USD") return usd;

  const rate = currencyRate(options.currency);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return usd / rate;
}

/** Human "~5s" style estimate for the ledger inclusion time. */
export function ledgerInclusionLabel(seconds: number): string {
  return `~${Math.max(1, Math.round(seconds))}s`;
}
