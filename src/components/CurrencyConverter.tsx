"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowRightLeft,
  Calculator,
  RefreshCw,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { AssetBadge } from "@/components/asset-badge";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { convertAmount, normalizeAssetCode } from "@/lib/exchange";
import { calculateConversion } from "@/lib/conversion";
import { formatAssetAmount } from "@/lib/currency";

export interface CurrencyConverterProps {
  /** Initial amount to convert */
  defaultAmount?: string;
  /** Initial source currency code (e.g. "USD", "EUR", "XLM", "USDC") */
  defaultSourceCurrency?: string;
  /** Initial target currency code (e.g. "XLM", "USDC") */
  defaultTargetCurrency?: string;
  /** Callback triggered when conversion result updates */
  onConvert?: (result: {
    sourceAmount: string;
    sourceCurrency: string;
    targetAmount: string;
    targetCurrency: string;
    rate: number;
  }) => void;
  /** Optional callback to apply the converted amount into an active form */
  onApply?: (targetAmount: string, targetCurrency: string) => void;
  /** Visual presentation mode */
  variant?: "card" | "compact" | "inline";
  className?: string;
}

const POPULAR_CURRENCIES = [
  { code: "USD", label: "USD - US Dollar", symbol: "$" },
  { code: "EUR", label: "EUR - Euro", symbol: "€" },
  { code: "GBP", label: "GBP - British Pound", symbol: "£" },
  { code: "CAD", label: "CAD - Canadian Dollar", symbol: "CA$" },
  { code: "NGN", label: "NGN - Nigerian Naira", symbol: "₦" },
  { code: "PHP", label: "PHP - Philippine Peso", symbol: "₱" },
  { code: "ARS", label: "ARS - Argentine Peso", symbol: "$" },
  { code: "XLM", label: "XLM - Stellar Lumens", symbol: "XLM" },
  { code: "USDC", label: "USDC - USD Coin", symbol: "USDC" },
];

/**
 * CurrencyConverter Component.
 * Real-time exchange rate calculator for multi-currency groups and Stellar settlements.
 */
export function CurrencyConverter({
  defaultAmount = "100",
  defaultSourceCurrency = "USD",
  defaultTargetCurrency = "USDC",
  onConvert,
  onApply,
  variant = "card",
  className,
}: CurrencyConverterProps) {
  const { rates, isLive, isFetching, timestamp } = useExchangeRates();

  const [sourceAmount, setSourceAmount] = useState(defaultAmount);
  const [sourceCurrency, setSourceCurrency] = useState(defaultSourceCurrency);
  const [targetCurrency, setTargetCurrency] = useState(defaultTargetCurrency);

  // Compute conversion rate and converted amount
  const { convertedAmount, unitRate, isFallback } = useMemo(() => {
    const from = normalizeAssetCode(sourceCurrency);
    const to = normalizeAssetCode(targetCurrency);

    // If identical currency
    if (from === to) {
      return { convertedAmount: sourceAmount, unitRate: 1.0, isFallback: false };
    }

    // Try primary conversion utility with fallback support
    const result = calculateConversion(sourceAmount || "0", from, to, rates);
    if (!result.error) {
      return {
        convertedAmount: result.targetAmount,
        unitRate: result.rate,
        isFallback: result.isFallback || !isLive,
      };
    }

    // Attempt direct conversion using exchange utility
    const converted = convertAmount(sourceAmount || "0", from, to, rates);
    const singleUnit = convertAmount("1", from, to, rates);
    const rateNumber = singleUnit ? parseFloat(singleUnit) : 1.0;

    return {
      convertedAmount: converted ?? "0",
      unitRate: rateNumber,
      isFallback: !isLive,
    };
  }, [sourceAmount, sourceCurrency, targetCurrency, rates, isLive]);

  // Trigger onConvert callback
  useEffect(() => {
    if (onConvert) {
      onConvert({
        sourceAmount,
        sourceCurrency,
        targetAmount: convertedAmount,
        targetCurrency,
        rate: unitRate,
      });
    }
  }, [sourceAmount, sourceCurrency, targetCurrency, convertedAmount, unitRate, onConvert]);

  const handleSwap = () => {
    setSourceCurrency(targetCurrency);
    setTargetCurrency(sourceCurrency);
    setSourceAmount(convertedAmount);
  };

  const content = (
    <div className="space-y-4" data-testid="currency-converter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-ink bg-butter shadow-brutal-sm">
            <Calculator className="h-4 w-4 text-ink" />
          </span>
          <div>
            <h4 className="font-display text-base uppercase tracking-tight text-ink">
              Currency Converter
            </h4>
          </div>
        </div>
        <Badge tone={!isFallback && isLive ? "lime" : "butter"} className="text-[10px] font-mono">
          {!isFallback && isLive ? "Live DEX Rates" : "Indicative Rates"}
        </Badge>
      </div>

      {/* Input / Output Row */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] items-center gap-3">
        {/* Source */}
        <div className="space-y-1.5">
          <Label htmlFor="source-amount" className="text-xs font-bold text-ink/70">
            You Spend
          </Label>
          <div className="flex rounded-xl border-3 border-ink bg-paper shadow-brutal-sm overflow-hidden">
            <Input
              id="source-amount"
              type="number"
              min="0"
              step="any"
              value={sourceAmount}
              onChange={(e) => setSourceAmount(e.target.value)}
              className="border-0 shadow-none rounded-none font-mono text-base font-bold focus-visible:ring-0"
              placeholder="0.00"
              data-testid="converter-source-input"
            />
            <select
              value={sourceCurrency}
              onChange={(e) => setSourceCurrency(e.target.value)}
              className="border-l-2 border-ink bg-cream px-2 py-1 text-xs font-bold font-mono focus:outline-none"
              data-testid="converter-source-select"
            >
              {POPULAR_CURRENCIES.map((c) => (
                <option key={`src-${c.code}`} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center sm:pt-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSwap}
            className="rounded-full h-9 w-9 p-0 border-2"
            title="Swap currencies"
            data-testid="converter-swap-btn"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Target */}
        <div className="space-y-1.5">
          <Label htmlFor="target-amount" className="text-xs font-bold text-ink/70">
            Settlement Equivalent
          </Label>
          <div className="flex rounded-xl border-3 border-ink bg-cream shadow-brutal-sm overflow-hidden">
            <div
              id="target-amount"
              className="w-full px-3 py-2 font-mono text-base font-bold text-ink truncate select-all flex items-center"
              data-testid="converter-target-output"
            >
              {convertedAmount}
            </div>
            <select
              value={targetCurrency}
              onChange={(e) => setTargetCurrency(e.target.value)}
              className="border-l-2 border-ink bg-butter px-2 py-1 text-xs font-bold font-mono focus:outline-none"
              data-testid="converter-target-select"
            >
              {POPULAR_CURRENCIES.map((c) => (
                <option key={`tgt-${c.code}`} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Exchange Rate Badge & Apply Action */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t-2 border-ink/10 text-xs font-mono">
        <div className="text-ink/70 flex items-center gap-1.5" data-testid="converter-rate-info">
          <TrendingUp className="h-3.5 w-3.5 text-grape" />
          <span>
            1 {sourceCurrency} ≈ {unitRate.toFixed(4)} {targetCurrency}
          </span>
        </div>

        {onApply && (
          <Button
            type="button"
            size="sm"
            onClick={() => onApply(convertedAmount, targetCurrency)}
            data-testid="converter-apply-btn"
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Use in Expense
          </Button>
        )}
      </div>
    </div>
  );

  if (variant === "compact" || variant === "inline") {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={`border-3 border-ink bg-paper p-5 shadow-brutal ${className ?? ""}`}>
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}
export default CurrencyConverter;
