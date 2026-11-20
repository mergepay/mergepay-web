/**
 * Multi-currency balance aggregation utilities.
 *
 * Aggregates user balances across different Stellar assets to provide
 * a consolidated view of net positions per asset identity.
 */

import type { MemberBalance } from "./types";
import { amountToStroops } from "./currency";
import { assetIdentityKey } from "./utils/balance";

export interface AggregatedBalance {
  assetCode: string;
  assetIssuer: string | null;
  /** Net balance in stroops (integer representation) */
  netStroops: bigint;
  /** Net balance as decimal string */
  net: string;
  /** Number of balance entries contributing to this aggregation */
  count: number;
}

/**
 * Aggregate balances by asset code and issuer for one or all users.
 *
 * @param balances Array of member balances
 * @param userId Optional user ID to filter balances for a specific user
 * @returns Map of asset identity key to aggregated balance
 */
export function aggregateBalancesByAsset(
  balances: MemberBalance[],
  userId?: string
): Map<string, AggregatedBalance> {
  const filtered = userId 
    ? balances.filter((b) => b.userId === userId)
    : balances;

  const aggregation = new Map<string, AggregatedBalance>();

  for (const balance of filtered) {
    const assetCode = balance.assetCode;
    const assetIssuer = assetCode === "XLM" ? null : balance.assetIssuer ?? null;
    const key = assetIdentityKey(assetCode, assetIssuer);
    const stroops = amountToStroops(balance.net);

    if (stroops === null) continue;

    const existing = aggregation.get(key);
    if (existing) {
      aggregation.set(key, {
        assetCode,
        assetIssuer,
        netStroops: existing.netStroops + stroops,
        net: stroopsToDecimal(existing.netStroops + stroops),
        count: existing.count + 1,
      });
    } else {
      aggregation.set(key, {
        assetCode,
        assetIssuer,
        netStroops: stroops,
        net: balance.net,
        count: 1,
      });
    }
  }

  return aggregation;
}

/**
 * Convert stroops (integer) back to decimal string representation.
 *
 * @param stroops Integer stroop value
 * @returns Decimal string with 7 decimal places (Stellar precision)
 */
function stroopsToDecimal(stroops: bigint): string {
  const isNegative = stroops < 0n;
  const absStroops = isNegative ? -stroops : stroops;

  const intPart = absStroops / 10_000_000n;
  const fracPart = absStroops % 10_000_000n;

  const fracStr = fracPart.toString().padStart(7, "0");
  const result = `${intPart}.${fracStr}`;

  return isNegative ? `-${result}` : result;
}

/**
 * Get aggregated balances as a sorted array.
 *
 * @param aggregation Map of asset identity key to aggregated balance
 * @returns Array sorted by asset code
 */
export function getSortedAggregatedBalances(
  aggregation: Map<string, AggregatedBalance>
): AggregatedBalance[] {
  return Array.from(aggregation.values()).sort((a, b) =>
    a.assetCode.localeCompare(b.assetCode) ||
    (a.assetIssuer ?? "").localeCompare(b.assetIssuer ?? "")
  );
}

/**
 * Calculate total net position across all assets for a user.
 *
 * @param aggregation Map of asset identity key to aggregated balance
 * @returns Object with total stroops and per-asset breakdown
 */
export function calculateTotalNetPosition(
  aggregation: Map<string, AggregatedBalance>
): { totalStroops: bigint; byAsset: AggregatedBalance[] } {
  const byAsset = getSortedAggregatedBalances(aggregation);
  const totalStroops = byAsset.reduce((sum, b) => sum + b.netStroops, 0n);

  return { totalStroops, byAsset };
}
