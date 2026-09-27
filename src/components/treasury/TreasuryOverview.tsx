"use client";

/**
 * Treasury balance overview & asset distribution (#367).
 *
 * Shows what the group's treasury account actually holds: one row per asset
 * with its balance, an approximate fiat value and a distribution bar, plus
 * explicit fallbacks for the two states that must never look like a healthy
 * treasury — an empty (or all-zero) balance set, and assets whose trustline
 * has never been established.
 *
 * Balance data comes from React Query (`useTreasuryInfo`), so the header's
 * refresh control simply refetches on demand rather than inventing its own
 * cache. The distribution maths lives in `src/lib/treasury.ts` and is pure.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
  Coins,
  Landmark,
  PieChart,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/amount";
import { FiatEquivalent } from "@/components/FiatEquivalent";
import { useTreasuryInfo } from "@/lib/queries";
import { buildTreasuryDistribution, splitTrustlineState } from "@/lib/treasury";
import { useCurrencyRates, convertToFiat } from "@/hooks/useCurrencyRates";
import { useFiatPreference } from "@/lib/fiat-preference";
import { SETTLEMENT_ASSETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Lucide indicator per asset code, with a neutral default. */
function AssetIcon({ assetCode }: { assetCode: string }) {
  const code = assetCode.toUpperCase();
  const Icon = code === "USDC" ? CircleDollarSign : Coins;
  return <Icon className="h-4 w-4" aria-hidden />;
}

export function TreasuryOverview({
  groupId,
  className,
}: {
  groupId: string;
  className?: string;
}) {
  const query = useTreasuryInfo(groupId, Boolean(groupId));
  const preferredCurrency = useFiatPreference((s) => s.preferredCurrency);
  const { rates, isLive } = useCurrencyRates(preferredCurrency);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await query.refetch();
      toast.success("Treasury balances refreshed");
    } catch {
      toast.error("Could not refresh treasury balances");
    } finally {
      setRefreshing(false);
    }
  }

  const balances = query.data?.balances ?? [];
  const expectedAssets = SETTLEMENT_ASSETS.map((a) => a.code);
  const distribution = buildTreasuryDistribution(
    balances,
    (amount, code) => {
      const fiat = convertToFiat(amount, code, rates);
      return fiat === null ? 0 : parseFloat(fiat);
    },
    expectedAssets
  );
  const trustlines = splitTrustlineState(expectedAssets, balances);

  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2 border-b-3 border-ink bg-butter px-4 py-2.5">
        <span className="flex items-center gap-2 font-display text-xs uppercase tracking-widest">
          <Landmark className="h-4 w-4" /> Treasury overview
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefresh()}
          loading={refreshing}
          disabled={query.isLoading}
          aria-label="Refresh treasury balances"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {query.isLoading && (
          <p className="text-sm text-ink/60" role="status">
            Loading treasury balances…
          </p>
        )}

        {query.isError && !query.isLoading && (
          <div
            role="alert"
            className="rounded-xl border-3 border-ink bg-flamingo-pale p-3.5 text-xs"
          >
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" /> Could not load the treasury.
            </p>
            <p className="mt-1 text-ink/70">
              The balances for this group are unavailable right now.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        )}

        {!query.isLoading && !query.isError && distribution.allZero && (
          <div className="space-y-3">
            <div className="rounded-xl border-3 border-ink bg-cream p-4 text-sm">
              <p className="font-bold">No balances in the treasury yet</p>
              <p className="mt-1 text-xs text-ink/70">
                Deposit to the shared treasury to start tracking holdings here.
              </p>
            </div>
            {trustlines.missing.length > 0 && (
              <div
                role="status"
                className="rounded-xl border-2 border-dashed border-ink/50 bg-paper p-3 text-xs text-ink/70"
              >
                <p className="flex items-center gap-2 font-bold text-ink">
                  <AlertTriangle className="h-3.5 w-3.5" /> Trustlines not
                  established
                </p>
                <p className="mt-1">
                  {trustlines.missing.join(", ")} must be trusted before those
                  assets can be held.
                </p>
              </div>
            )}
          </div>
        )}

        {!query.isLoading && !query.isError && !distribution.allZero && (
          <div className="space-y-4">
            <p className="text-[10px] uppercase tracking-widest text-ink/50">
              {distribution.basis === "value"
                ? `Asset distribution · by ${preferredCurrency} value${isLive ? "" : " (indicative rate)"}`
                : "Asset distribution · relative to largest holding"}
            </p>

            <ul className="space-y-4">
              {distribution.assets.map((asset) => (
                <li key={`${asset.assetCode}:${asset.assetIssuer ?? ""}`} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-bold">
                      <AssetIcon assetCode={asset.assetCode} />
                      {asset.assetCode}
                      {!asset.established && (
                        <Badge tone="butter">No trustline</Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <Money value={asset.balance} assetCode={asset.assetCode} />
                      <FiatEquivalent
                        amount={asset.amount}
                        assetCode={asset.assetCode}
                      />
                      <span className="font-mono text-xs text-ink/60">
                        {asset.percent}%
                      </span>
                    </span>
                  </div>
                  <div
                    className="h-3 w-full overflow-hidden rounded-md border-2 border-ink bg-cream"
                    role="progressbar"
                    aria-label={`${asset.assetCode} share of treasury`}
                    aria-valuenow={asset.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={cn(
                        "h-full bg-grape transition-[width] duration-500",
                        !asset.established && "bg-butter"
                      )}
                      style={{ width: `${Math.min(100, asset.percent)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {trustlines.missing.length > 0 && (
              <p className="flex items-center gap-2 rounded-lg border-2 border-dashed border-ink/40 bg-paper p-2.5 text-xs text-ink/70">
                <PieChart className="h-3.5 w-3.5 shrink-0" />
                {trustlines.missing.join(", ")}{" "}
                {trustlines.missing.length === 1 ? "is" : "are"} not held by
                this treasury yet.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
