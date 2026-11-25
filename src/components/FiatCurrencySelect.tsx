"use client";

import { Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { useFiatPreference } from "@/lib/fiat-preference";
import {
  SUPPORTED_FIAT_CURRENCIES,
  type SupportedFiatCurrency,
} from "@/lib/currency";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";

const CURRENCY_LABELS: Record<SupportedFiatCurrency, string> = {
  USD: "US Dollar ($)",
  EUR: "Euro (€)",
  GBP: "British Pound (£)",
  CAD: "Canadian Dollar (C$)",
  ARS: "Argentine Peso ($)",
  PHP: "Philippine Peso (₱)",
};

/**
 * Fiat currency preference selector card (#228).
 *
 * Neobrutalist card with a bold header. Shows the currently selected
 * currency and whether live rates are available. Used on the settings
 * page and can be embedded anywhere the user needs to switch currencies.
 */
export function FiatCurrencySelect({ className }: { className?: string }) {
  const { preferredCurrency, setPreferredCurrency } = useFiatPreference();
  const { isLive } = useCurrencyRates(preferredCurrency);

  return (
    <Card className={className}>
      <CardHeader className="border-b-3 border-ink bg-tangerine-pale px-5 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4" />
            Fiat Display Currency
          </CardTitle>
          <span className="rounded-lg border-2 border-ink bg-paper px-2 py-0.5 font-display text-[10px] uppercase tracking-widest shadow-brutal-sm">
            {isLive ? "Live rates" : "Offline rates"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div>
          <Label htmlFor="fiat-currency">Display currency</Label>
          <Select
            id="fiat-currency"
            value={preferredCurrency}
            onChange={(e) =>
              setPreferredCurrency(e.target.value as SupportedFiatCurrency)
            }
          >
            {SUPPORTED_FIAT_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABELS[code]}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-ink/50">
          Approximate fiat equivalents next to crypto amounts use this
          currency. Rates are fetched live when possible and fall back to
          indicative values offline.
        </p>
      </CardContent>
    </Card>
  );
}
