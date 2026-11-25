"use client";

import React from "react";
import { TrendingUp, WifiOff, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ExchangeRateDisplayProps {
  /** Source currency code (e.g. "USD", "EUR", "XLM") */
  sourceCurrency: string;
  /** Target currency code (e.g. "USDC", "XLM") */
  targetCurrency: string;
  /** Exchange rate from source to target (1 source = rate target) */
  rate: number;
  /** Optional source amount being converted */
  sourceAmount?: string | number;
  /** Optional converted target amount */
  targetAmount?: string | number;
  /** Whether the rate is live from an active feed */
  isLive?: boolean;
  /** Whether the user/system is currently offline */
  isOffline?: boolean;
  /** Whether fallback/indicative rates are being used */
  isFallback?: boolean;
  /** Whether a background refresh is in flight */
  isFetching?: boolean;
  /** Visual presentation mode */
  variant?: "card" | "compact" | "badge";
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * ExchangeRateDisplay Component
 *
 * Neobrutalist exchange rate indicator conforming to the Mergepay design system.
 * Displays real-time or indicative conversion rates between fiat and crypto assets,
 * with clear fallback indicators when offline or when external rate APIs fail.
 */
export function ExchangeRateDisplay({
  sourceCurrency,
  targetCurrency,
  rate,
  sourceAmount,
  targetAmount,
  isLive = true,
  isOffline = false,
  isFallback = false,
  isFetching = false,
  variant = "card",
  className,
}: ExchangeRateDisplayProps) {
  const isIndicative = !isLive || isOffline || isFallback;
  const formattedRate = Number.isFinite(rate)
    ? rate < 0.0001
      ? rate.toExponential(4)
      : rate >= 1000
        ? rate.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : rate.toFixed(4)
    : "—";

  // Badge variant: just the rate and status badge
  if (variant === "badge") {
    return (
      <div
        className={cn("inline-flex items-center gap-2 font-mono text-xs font-bold", className)}
        data-testid="exchange-rate-badge"
      >
        <span className="text-ink/80">
          1 {sourceCurrency} ≈ {formattedRate} {targetCurrency}
        </span>
        {isIndicative ? (
          <Badge tone="butter" className="flex items-center gap-1 text-[10px]">
            {isOffline ? <WifiOff className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            <span>Fallback</span>
          </Badge>
        ) : (
          <Badge tone="lime" className="flex items-center gap-1 text-[10px]">
            <TrendingUp className="h-3 w-3" />
            <span>Live</span>
          </Badge>
        )}
      </div>
    );
  }

  // Compact variant: row with exchange rate and fallback indicator
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-ink bg-paper p-2.5 font-mono text-xs shadow-brutal-sm",
          className
        )}
        data-testid="exchange-rate-compact"
      >
        <div className="flex items-center gap-1.5 text-ink font-bold">
          <TrendingUp className="h-3.5 w-3.5 text-grape" />
          <span>
            1 {sourceCurrency} ≈ {formattedRate} {targetCurrency}
          </span>
          {isFetching && <RefreshCw className="h-3 w-3 animate-spin text-ink/40 ml-1" />}
        </div>

        {isIndicative ? (
          <div className="flex items-center gap-1.5 text-tangerine-dark font-bold text-[11px]" data-testid="rate-fallback-indicator">
            {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            <span>{isOffline ? "Offline Estimate" : "Indicative Rate"}</span>
          </div>
        ) : (
          <Badge tone="lime" className="text-[10px]">
            Live DEX Rate
          </Badge>
        )}
      </div>
    );
  }

  // Default: full card conforming to Neobrutalist design
  return (
    <div
      className={cn(
        "rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal",
        className
      )}
      data-testid="exchange-rate-display"
    >
      <div className="flex items-center justify-between gap-2 border-b-2 border-ink/10 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-butter shadow-brutal-sm">
            <TrendingUp className="h-4 w-4 text-ink" />
          </span>
          <span className="font-display text-xs font-bold uppercase tracking-wider text-ink">
            Reference Exchange Rate
          </span>
        </div>

        {isIndicative ? (
          <Badge tone="butter" className="flex items-center gap-1 text-[10px]" data-testid="rate-fallback-badge">
            {isOffline ? <WifiOff className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            <span>{isOffline ? "Offline" : "Indicative Rate"}</span>
          </Badge>
        ) : (
          <Badge tone="lime" className="flex items-center gap-1 text-[10px]" data-testid="rate-live-badge">
            <TrendingUp className="h-3 w-3" />
            <span>Live DEX Rate</span>
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold text-ink/70">Conversion Rate</span>
          <span className="font-mono text-sm font-bold text-ink">
            1 {sourceCurrency} = {formattedRate} {targetCurrency}
          </span>
        </div>

        {sourceAmount !== undefined && targetAmount !== undefined && (
          <div className="flex items-baseline justify-between rounded-xl border-2 border-ink bg-cream p-2.5 font-mono text-xs">
            <span className="text-ink/70">
              {sourceAmount} {sourceCurrency}
            </span>
            <span className="font-bold text-ink">
              ≈ {targetAmount} {targetCurrency}
            </span>
          </div>
        )}

        {isIndicative && (
          <p className="text-[11px] font-medium text-ink/70 pt-1" data-testid="rate-fallback-notice">
            {isOffline
              ? "Your device is offline. Showing cached indicative conversion rates."
              : "Live rate API temporarily unavailable. Using indicative reference rates."}
          </p>
        )}
      </div>
    </div>
  );
}

export default ExchangeRateDisplay;
