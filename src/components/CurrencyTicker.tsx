"use client";

import React from "react";
import { Coins, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { buildTickerRates, formatTickerRate } from "@/lib/currencyTicker";

/**
 * Compact reference-rate ticker for the group summary (#888).
 *
 * Prices come from `useCurrencyRates`, which always returns data — a live
 * CoinGecko fetch when it can, and the static indicative values otherwise.
 * The badge tells the user which one they are looking at instead of hiding
 * the ticker while the network is unavailable.
 */
export function CurrencyTicker() {
  const { rates, isLive, isFetching } = useCurrencyRates("USD");
  const rows = buildTickerRates(rates);

  return (
    <Card className="border-3 border-ink bg-paper shadow-brutal">
      <CardContent className="p-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-lime shadow-brutal-sm">
            <Coins className="h-4 w-4 text-ink" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-xs uppercase tracking-wider text-ink">
                Live Rates
              </span>
              <span
                className={`inline-block h-2 w-2 rounded-full border border-ink ${
                  isLive ? "bg-lime animate-pulse" : "bg-butter"
                }`}
                aria-hidden="true"
              />
            </div>
            <p className="text-xs text-ink/60">Stellar reference oracle pricing</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {rows.map((item) => (
            <div
              key={item.assetCode}
              className="flex items-center gap-2 rounded-xl border-2 border-ink bg-cream px-3 py-1.5 shadow-brutal-sm"
            >
              <span className="font-display text-xs uppercase font-bold">
                {item.assetCode}
              </span>
              <span className="font-mono text-xs">
                ${formatTickerRate(item.rate)}
              </span>
            </div>
          ))}

          <Badge tone={isLive ? "lime" : "butter"} className="text-[10px]">
            {isLive ? "Live" : "Indicative"}
          </Badge>

          {isFetching && (
            <RefreshCw
              className="h-3.5 w-3.5 animate-spin text-ink/40"
              aria-label="Refreshing rates"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
