/**
 * Cross-group balance totals, grouped by asset.
 *
 * A user can be owed USDC in one circle and owe XLM in another. Adding
 * those figures together produces a number that means nothing and, once
 * it is rendered next to a single asset code, actively misleads. So the
 * dashboard aggregates per asset and labels each total.
 *
 * All arithmetic is done in stroops (integers) so summing many balances
 * cannot introduce floating-point drift.
 */

import { amountToStroops, normalizeAssetCode } from "./currency";
import { fromStroops } from "./money";

export interface AssetNetTotals {
  assetCode: string;
  /** Sum of positive balances — what others owe the user. */
  owed: string;
  /** Sum of negative balances as a positive figure — what the user owes. */
  owe: string;
  /** `owed - owe`, signed. */
  net: string;
}

export interface NetBalanceInput {
  /** Signed decimal string, as in `GroupSummary.yourNet`. */
  yourNet: string;
  /** Asset the balance is denominated in, as in `GroupSummary.netAssetCode`. */
  netAssetCode: string;
}

/**
 * Total each asset's exposure across the given balances.
 *
 * Entries with an unreadable amount or no asset code are skipped rather
 * than silently counted as zero. The result is ordered by gross exposure
 * (`owed + owe`) descending so the dashboard can lead with the asset the
 * user actually has the most at stake in, with ties broken alphabetically
 * for a stable render.
 */
export function summarizeNetsByAsset(
  balances: readonly NetBalanceInput[]
): AssetNetTotals[] {
  const byAsset = new Map<string, { owed: bigint; owe: bigint }>();

  for (const balance of balances) {
    const assetCode = normalizeAssetCode(balance?.netAssetCode);
    if (!assetCode) continue;

    const stroops = amountToStroops(balance?.yourNet);
    if (stroops === null) continue;

    const totals = byAsset.get(assetCode) ?? { owed: 0n, owe: 0n };
    if (stroops > 0n) totals.owed += stroops;
    else totals.owe += -stroops;
    byAsset.set(assetCode, totals);
  }

  return [...byAsset.entries()]
    .map(([assetCode, { owed, owe }]) => ({
      assetCode,
      gross: owed + owe,
      owed: fromStroops(owed),
      owe: fromStroops(owe),
      net: fromStroops(owed - owe),
    }))
    .sort((a, b) =>
      a.gross === b.gross
        ? a.assetCode.localeCompare(b.assetCode)
        : a.gross > b.gross
          ? -1
          : 1
    )
    .map(({ gross: _gross, ...totals }) => totals);
}
