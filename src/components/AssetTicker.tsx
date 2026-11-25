"use client";

import { AlertTriangle, ArrowRightLeft, RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetTickerRates, type AssetTickerRates } from "@/hooks/useAssetTickerRates";
import { PRIMARY_TICKER_PAIRS, formatPairRate, formatRateAge } from "@/lib/assetTicker";
import { cn } from "@/lib/utils";

export interface AssetTickerProps {
  className?: string;
  /**
   * Injected rates, for previews and tests. Production callers omit it and
   * the component polls the price feed itself.
   */
  rates?: AssetTickerRates;
  /** Clock for the "updated … ago" label; injectable for tests. */
  now?: number;
}

/**
 * Multi-asset exchange-rate ticker (#904).
 *
 * Shows the primary Stellar pairs — XLM/USD and USDC/XLM — so users can see
 * conversion rates before submitting a settlement. Polling, caching and the
 * live/stale decision live in `useAssetTickerRates` and `lib/assetTicker.ts`;
 * this component only renders the four states:
 *
 *  - loading     → skeleton pills the size of the real ones
 *  - live        → rates with a "Live" badge
 *  - stale       → last-known rates with a "Stale" badge and their age
 *  - unavailable → a message and a retry control
 */
export function AssetTicker({ className, rates, now }: AssetTickerProps) {
  return rates ? (
    <AssetTickerView rates={rates} now={now} className={className} />
  ) : (
    <LiveAssetTicker now={now} className={className} />
  );
}

function LiveAssetTicker({ className, now }: Omit<AssetTickerProps, "rates">) {
  const rates = useAssetTickerRates();
  return <AssetTickerView rates={rates} now={now} className={className} />;
}

function StatusBadge({ rates, now }: { rates: AssetTickerRates; now?: number }) {
  switch (rates.status) {
    case "live":
      return (
        <Badge tone="lime" data-testid="asset-ticker-status">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink motion-safe:animate-pulse" aria-hidden />
          Live
        </Badge>
      );
    case "stale":
      return (
        <Badge
          tone="butter"
          data-testid="asset-ticker-status"
          title="The price feed could not be reached; showing the last known rates."
        >
          <WifiOff className="h-3 w-3" aria-hidden />
          Stale
          {rates.updatedAt !== null && (
            <span className="normal-case tracking-normal">
              · {formatRateAge(rates.updatedAt, now)}
            </span>
          )}
        </Badge>
      );
    case "unavailable":
      return (
        <Badge tone="flamingo" data-testid="asset-ticker-status">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Unavailable
        </Badge>
      );
    default:
      return (
        <Badge tone="paper" data-testid="asset-ticker-status">
          Loading
        </Badge>
      );
  }
}

function AssetTickerView({
  rates,
  now,
  className,
}: {
  rates: AssetTickerRates;
  now?: number;
  className?: string;
}) {
  const { status, quotes, isFetching, refetch } = rates;

  return (
    <Card
      className={cn(
        "border-3 border-ink bg-paper p-3 shadow-brutal sm:p-4 max-w-full overflow-hidden",
        className
      )}
      data-testid="asset-ticker"
      data-status={status}
      aria-busy={status === "loading" || undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-aqua shadow-brutal-sm">
            <ArrowRightLeft className="h-4 w-4 text-ink" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xs uppercase tracking-wider text-ink">
              Exchange rates
            </h2>
            <p className="truncate text-[11px] text-ink/60">Reference prices · not a settlement quote</p>
          </div>
          <span className="ml-auto shrink-0 pl-1">
            <StatusBadge rates={rates} now={now} />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === "loading" && (
            <div role="status" className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <span className="sr-only">Loading exchange rates…</span>
              {PRIMARY_TICKER_PAIRS.map((pair) => (
                <Skeleton
                  key={`${pair.base}/${pair.quote}`}
                  className="h-8 sm:w-36"
                  data-testid="asset-ticker-skeleton"
                />
              ))}
            </div>
          )}

          {status === "unavailable" && (
            <p role="alert" className="flex items-center gap-2 text-xs font-bold text-ink/80">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              Rates unavailable right now.
            </p>
          )}

          {quotes.length > 0 && (
            <ul
              aria-label="Exchange rates"
              className="grid w-full grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex sm:w-auto"
            >
              {quotes.map((quote) => (
                <li
                  key={quote.label}
                  data-testid={`asset-ticker-pair-${quote.pair.base}-${quote.pair.quote}`}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border-2 border-ink px-3 py-1.5 shadow-brutal-sm",
                    status === "stale" ? "bg-butter-pale" : "bg-cream"
                  )}
                >
                  <span className="font-display text-xs font-bold uppercase">{quote.label}</span>
                  <span className="font-mono text-xs tabular-nums">
                    {formatPairRate(quote.rate, quote.pair.quote)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {status !== "loading" && (
            <Button
              size="sm"
              variant="outline"
              onClick={refetch}
              disabled={isFetching}
              aria-label="Refresh exchange rates"
              className="ml-auto sm:ml-0"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "motion-safe:animate-spin")} aria-hidden />
              {status === "unavailable" && <span>Retry</span>}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
