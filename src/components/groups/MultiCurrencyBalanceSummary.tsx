"use client";

import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Money } from "../amount";
import { aggregateBalancesByAsset, getSortedAggregatedBalances } from "@/lib/balanceAggregation";
import {
  aggregateBalancesInAsset,
  assetExchangeRates,
  formatAssetEquivalent,
} from "@/lib/currencyConversion";
import { formatAssetAmountText } from "@/lib/currency";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { useFiatPreference } from "@/lib/fiat-preference";
import type { MemberBalance } from "@/lib/types";

export interface MultiCurrencyBalanceSummaryProps {
  balances: MemberBalance[];
  userId?: string;
  className?: string;
}

/**
 * Multi-currency balance summary widget displaying net positions per asset.
 * Shows aggregated balances across different Stellar assets (XLM, USDC, etc.)
 * with proper formatting and neobrutalist styling.
 *
 * When a group holds more than one asset, each position is also shown as its
 * equivalent in the summary's base asset, and the legs are totalled into it —
 * a member who is +12 USDC and -80 XLM cannot read their overall position from
 * two unrelated numbers. The base asset is the first row, so the choice is
 * stable across renders rather than following whichever rate arrived last.
 */
export function MultiCurrencyBalanceSummary({
  balances,
  userId,
  className = "",
}: MultiCurrencyBalanceSummaryProps) {
  const preferredCurrency = useFiatPreference((s) => s.preferredCurrency);
  const { rates } = useCurrencyRates(preferredCurrency);
  const aggregation = aggregateBalancesByAsset(balances, userId);
  const sortedBalances = getSortedAggregatedBalances(aggregation);
  const baseAsset = sortedBalances[0]?.assetCode;
  const exchange = assetExchangeRates(rates);
  // A single-asset group has nothing to convert against. The cross rate comes
  // from the fiat feed, so when that has not resolved to a usable pair the
  // helpers below return null and we show no estimate rather than a guessed one.
  const comparable = baseAsset !== undefined && sortedBalances.length > 1;
  const totalInBase = comparable
    ? aggregateBalancesInAsset(
        sortedBalances.map((b) => ({ amount: b.net, assetCode: b.assetCode })),
        baseAsset,
        exchange
      )
    : null;

  if (sortedBalances.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs uppercase tracking-widest text-ink/60">
            Net Balances by Asset
          </h3>
          <Badge tone="ink" className="text-xs">
            {sortedBalances.length} {sortedBalances.length === 1 ? "asset" : "assets"}
          </Badge>
        </div>
        <div className="space-y-2">
          {sortedBalances.map((balance) => {
            const equivalent =
              comparable && balance.assetCode !== baseAsset
                ? formatAssetEquivalent(balance.net, balance.assetCode, baseAsset, exchange)
                : null;
            return (
              <div
                key={balance.assetCode}
                className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border-2 border-ink/20 bg-cream/50"
              >
                <span className="font-mono text-sm font-bold text-ink/80">
                  {balance.assetCode}
                </span>
                <span className="flex flex-col items-end">
                  <Money value={balance.net} assetCode={balance.assetCode} />
                  {equivalent !== null && (
                    <span className="font-mono text-[10px] tabular-nums text-ink/40">
                      {equivalent}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {totalInBase !== null && (
          <div className="flex items-center justify-between gap-3 border-t-2 border-ink/10 pt-3">
            <span className="font-display text-xs uppercase tracking-widest text-ink/60">
              Total in {baseAsset}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-ink">
              {formatAssetAmountText(totalInBase, baseAsset, {
                minDecimals: 2,
                maxDecimals: 4,
              })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
