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
  const exchange = assetExchangeRates(rates);
  const convertedTotal = baseAsset ? aggregateBalancesInAsset(sortedBalances, baseAsset, exchange) : null;

  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xs uppercase tracking-widest text-ink/60">
            Consolidated Balances
          </h3>
          {baseAsset && convertedTotal !== null && (
            <span className="text-xs font-bold text-ink">
              Total: {formatAssetAmountText(convertedTotal, baseAsset)}
            </span>
          )}
        </div>

        {sortedBalances.length === 0 ? (
          <p className="text-sm text-ink/50">No balance data available.</p>
        ) : (
          <div className="space-y-3">
            {sortedBalances.map((item) => {
              const isNative = item.assetCode === "XLM";
              const hasTrustline = isNative || userTrustlines.includes(item.assetCode);
              const equivalent =
                baseAsset && baseAsset !== item.assetCode && exchange
                  ? formatAssetEquivalent(item.net, item.assetCode, baseAsset, exchange)
                  : null;

              return (
                <div
                  key={item.assetCode}
                  className="flex flex-col gap-1 rounded-xl border-2 border-ink/20 bg-cream/55 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{item.assetCode}</span>
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
                    <Money value={item.net} assetCode={item.assetCode} assetIssuer={item.assetIssuer} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MultiCurrencyBalanceSummary;
