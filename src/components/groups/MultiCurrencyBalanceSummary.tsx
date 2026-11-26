"use client";

import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Money } from "../amount";
import { aggregateBalancesByAsset, getSortedAggregatedBalances } from "@/lib/balanceAggregation";
import { assetIdentityKey } from "@/lib/utils/balance";
import {
  aggregateBalancesInAsset,
  assetExchangeRates,
  formatAssetEquivalent,
} from "@/lib/currencyConversion";
import { formatAssetAmountText } from "@/lib/currency";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { useFiatPreference } from "@/lib/fiat-preference";
import type { MemberBalance } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

export interface MultiCurrencyBalanceSummaryProps {
  balances: MemberBalance[];
  userId?: string;
  className?: string;
  userTrustlines?: string[];
}

/**
 * Multi-currency balance summary widget displaying net positions per asset.
 * Shows aggregated balances across different Stellar assets (XLM, USDC, etc.)
 * with proper formatting, cross-asset equivalents, and trustline warnings.
 *
 * When a group holds more than one distinct asset, each position is also shown
 * as its equivalent in the summary's base asset and the legs are totalled into
 * it — a member who is +12 USDC and -80 XLM cannot read their overall position
 * from two unrelated numbers. The base asset is the first row, so the choice is
 * stable across renders rather than following whichever rate arrived last.
 *
 * Two rows can share an asset code but have different issuers. They are kept
 * separate (and are never totalled together) because they are different Stellar
 * assets whose cross rates may not agree.
 */
export function MultiCurrencyBalanceSummary({
  balances,
  userId,
  className = "",
  userTrustlines = [],
}: MultiCurrencyBalanceSummaryProps) {
  const preferredCurrency = useFiatPreference((s) => s.preferredCurrency);
  const { rates } = useCurrencyRates(preferredCurrency);
  const aggregation = aggregateBalancesByAsset(balances, userId);
  const sortedBalances = getSortedAggregatedBalances(aggregation);
  const baseAsset = sortedBalances[0]?.assetCode;
  const duplicateCodes = new Set(
    sortedBalances
      .filter(
        (balance, index, all) =>
          all.findIndex((item) => item.assetCode === balance.assetCode) !== index
      )
      .map((balance) => balance.assetCode)
  );
  const exchange = assetExchangeRates(rates);
  // A single-asset group has nothing to convert against. The cross rate comes
  // from the fiat feed, so when that has not resolved to a usable pair — or the
  // same code appears with two issuers — the helpers return null and we show no
  // estimate rather than a guessed one.
  const comparable =
    baseAsset !== undefined && sortedBalances.length > 1 && duplicateCodes.size === 0;
  const totalInBase = comparable
    ? aggregateBalancesInAsset(
        sortedBalances.map((b) => ({ amount: b.net, assetCode: b.assetCode })),
        baseAsset,
        exchange
      )
    : null;

  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xs uppercase tracking-widest text-ink/60">
            Consolidated Balances
          </h3>
        </div>

        {sortedBalances.length === 0 ? (
          <p className="text-sm text-ink/50">No balance data available.</p>
        ) : (
          <div className="space-y-3">
            {sortedBalances.map((item) => {
              const isNative = item.assetCode === "XLM";
              const hasTrustline = isNative || userTrustlines.includes(item.assetCode);
              const equivalent =
                comparable && baseAsset && baseAsset !== item.assetCode && exchange
                  ? formatAssetEquivalent(item.net, item.assetCode, baseAsset, exchange)
                  : null;

              return (
                <div
                  key={assetIdentityKey(item.assetCode, item.assetIssuer)}
                  className="flex flex-col gap-1 rounded-xl border-2 border-ink/20 bg-cream/55 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{item.assetCode}</span>
                    {item.assetIssuer && (
                      <span className="text-xs text-ink/60" title={item.assetIssuer}>
                        {item.assetIssuer.slice(0, 5)}…{item.assetIssuer.slice(-4)}
                      </span>
                    )}
                    {!hasTrustline && (
                      <Badge tone="flamingo" className="gap-1">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Missing Trustline
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {equivalent && (
                      <span className="text-xs text-ink/60" title="Equivalent in base asset">
                        ({equivalent})
                      </span>
                    )}
                    <Money
                      value={item.net}
                      assetCode={item.assetCode}
                      assetIssuer={item.assetIssuer}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalInBase !== null && baseAsset && (
          <div className="flex items-center justify-between gap-3 border-t-2 border-ink/10 pt-3">
            <span className="font-display text-xs uppercase tracking-widest text-ink/60">
              Total in {baseAsset}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-ink">
              {formatAssetAmountText(totalInBase, baseAsset)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MultiCurrencyBalanceSummary;
