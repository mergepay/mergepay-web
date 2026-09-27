"use client";

import { Select } from "@/components/ui/input";
import { AssetBadge } from "@/components/asset-badge";
import { SETTLEMENT_ASSETS, STABLE_ASSET } from "@/lib/constants";
import { convertToFiat, useCurrencyRates } from "@/hooks/useCurrencyRates";
import type { SupportedFiatCurrency } from "@/lib/currency";

export interface AssetSelectorProps {
  /** Currently selected asset code (one of the configured settlement assets). */
  value: string;
  onChange: (assetCode: string) => void;
  onBlur?: () => void;
  id?: string;
  /** Transition labels for the available options (e.g. "native", "stable"). */
  name?: (code: string) => string;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
  /**
   * When provided, the selector renders a live fiat-equivalent of this crypto
   * amount (in `fiatCurrency`) that updates as the user types/edits the
   * amount — the "real-time conversion" half of issue #401.
   */
  cryptoAmount?: string;
  fiatCurrency?: SupportedFiatCurrency;
}

/**
 * Controlled multi-asset selector (issue #401).
 *
 * A neobrutalist `<select>` of the configured settlement assets (XLM native,
 * the stable asset, and any custom trustline tokens) plus a live fiat
 * equivalent preview. It is fully controlled — the parent owns `value` and
 * `onChange` — so it composes with React Hook Form, local `useState`, or a
 * draft store. Precision/rounding for the Stellar grid is delegated to the
 * existing `src/lib/money` / `src/lib/currency` helpers so the dozens of
 * decimal places (7 = 1 stroop) are never truncated here.
 */
export function AssetSelector({
  value,
  onChange,
  onBlur,
  id,
  name: nameOf,
  ariaInvalid,
  ariaDescribedby,
  cryptoAmount,
  fiatCurrency = "USD",
}: AssetSelectorProps) {
  const selected =
    SETTLEMENT_ASSETS.find((a) => a.code === value) ?? SETTLEMENT_ASSETS[0];

  const equivalent = useLiveEquivalent(cryptoAmount, selected.code, fiatCurrency);

  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
      >
        {SETTLEMENT_ASSETS.map((a) => (
          <option key={a.code} value={a.code}>
            {a.code}
            {nameOf
              ? ` (${nameOf(a.code)})`
              : a.code === "XLM"
              ? " (native)"
              : a.code === STABLE_ASSET.code
              ? " (stable)"
              : ""}
          </option>
        ))}
      </Select>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <AssetBadge code={selected.code} className="shrink-0" />
        <span
          className="truncate text-xs font-medium text-ink/60"
          aria-live="polite"
          data-testid="asset-equivalent"
        >
          {equivalent}
        </span>
      </div>
    </div>
  );
}

/** Fiat-equivalent of `cryptoAmount` in the selected asset, or a prompt. */
function useLiveEquivalent(
  cryptoAmount: string | undefined,
  assetCode: string,
  fiatCurrency: SupportedFiatCurrency
): string {
  const { rates } = useCurrencyRates(fiatCurrency);

  if (!cryptoAmount) return "Enter an amount for a fiat preview.";

  const numeric = Number(cryptoAmount);
  if (!Number.isFinite(numeric) || numeric < 0)
    return "Fiat preview unavailable.";

  // Only the price-tracked assets (XLM / the stable asset) get a live quote.
  const fiat = convertToFiat(cryptoAmount, assetCode, rates);
  if (fiat === null) return "Fiat preview unavailable for this asset.";

  return `≈ ${fiat} ${fiatCurrency}`;
}
