"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, RefreshCw, AlertCircle, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface RateData {
  assetCode: string;
  rate: number;
  change24h: number;
}

export function CurrencyTicker() {
  const { data, isLoading, isError, refetch } = useQuery<RateData[]>({
    queryKey: ["currency-ticker-rates"],
    queryFn: async () => {
      // Simulated live reference oracle/pool rates for XLM and USDC
      return [
        { assetCode: "XLM", rate: 0.125, change24h: 3.4 },
        { assetCode: "USDC", rate: 1.0, change24h: 0.0 },
      ];
    },
    refetchInterval: 15000,
  });

  return (
    <Card className="border-3 border-ink bg-paper shadow-brutal">
      <CardContent className="p-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-lime shadow-brutal-sm">
            <Coins className="h-4 w-4 text-ink" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-xs uppercase tracking-wider text-ink">Live Rates</span>
              <span className="inline-block h-2 w-2 rounded-full bg-lime border border-ink animate-pulse" />
            </div>
            <p className="text-xs text-ink/60">Stellar reference oracle pricing</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading rates...
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-sm text-flamingo">
            <AlertCircle className="h-4 w-4" /> Failed to load rates
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            {data?.map((item) => (
              <div key={item.assetCode} className="flex items-center gap-2 rounded-xl border-2 border-ink bg-cream px-3 py-1.5 shadow-brutal-sm">
                <span className="font-display text-xs uppercase font-bold">{item.assetCode}</span>
                <span className="font-mono text-xs">${item.rate.toFixed(3)}</span>
                <span className={`flex items-center text-[10px] font-bold ${item.change24h >= 0 ? "text-lime-600" : "text-flamingo"}`}>
                  <TrendingUp className="h-3 w-3 mr-0.5" /> {item.change24h >= 0 ? `+${item.change24h}%` : `${item.change24h}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
