"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrencyRates, convertToFiat } from "@/hooks/useCurrencyRates";
import { useFiatPreference } from "@/lib/fiat-preference";
import type { SupportedFiatCurrency } from "@/lib/currency";

/**
 * Displays an approximate fiat equivalent next to a crypto amount.
 *
 * Styled as a bold neobrutalist badge (thick ink border, hard offset
 * shadow, high-contrast background) so it stands out inline without
 * competing with the primary crypto amount.
 *
 * @example
 * ```tsx
 * <FiatEquivalent amount="25.5" assetCode="XLM" />
 * ```
 */
export function FiatEquivalent({
  amount,
  assetCode,
  className,
}: {
  /** The crypto amount to convert. */
  amount: string | number;
  /** The asset code (e.g. "XLM", "USDC"). */
  assetCode: string;
  className?: string;
}) {
  const preferredCurrency = useFiatPreference((s) => s.preferredCurrency);
  const { rates, isLive } = useCurrencyRates(preferredCurrency);
  const fiatValue = convertToFiat(amount, assetCode, rates);

  if (fiatValue === null) return null;

  const numericValue = Number(fiatValue);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: preferredCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums shadow-brutal-sm",
        isLive ? "bg-butter-pale text-ink" : "bg-paper text-ink/60",
        className
      )}
      title={
        isLive
          ? `Live ${preferredCurrency} rate`
          : `Approximate rate (offline fallback)`
      }
    >
      ≈ {formatted}
    </span>
  );
}

/**
 * Compact fiat equivalent that renders inline without a border.
 * Useful for tight layouts like share rows where the full badge
 * would be too visually heavy.
 */
export function FiatInline({
  amount,
  assetCode,
  className,
}: {
  amount: string | number;
  assetCode: string;
  className?: string;
}) {
  const preferredCurrency = useFiatPreference((s) => s.preferredCurrency);
  const { rates } = useCurrencyRates(preferredCurrency);
  const fiatValue = convertToFiat(amount, assetCode, rates);

  if (fiatValue === null) return null;

  const numericValue = Number(fiatValue);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: preferredCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);

  return (
    <span
      className={cn(
        "font-mono text-[10px] tabular-nums text-ink/40",
        className
      )}
    >
      ≈ {formatted}
    </span>
  );
}
