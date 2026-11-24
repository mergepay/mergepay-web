"use client";

import { useQuery } from "@tanstack/react-query";
import { parseTickerRates, type TickerRates } from "@/lib/currency-ticker";

async function fetchCoinGeckoTickerRates(): Promise<TickerRates> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=usd,eur,gbp,cad",
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error("Rate provider unavailable");
    return parseTickerRates(await response.json() as unknown);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTickerRates(): Promise<TickerRates> {
  try {
    return await fetchCoinGeckoTickerRates();
  } catch {
    // A second independent provider can supply an XLM/USD spot rate.
    // Other currency pairs remain unavailable rather than guessed.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch("https://api.coinbase.com/v2/prices/XLM-USD/spot", {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Backup rate provider unavailable");
      const payload = await response.json() as { data?: { amount?: string } };
      const xlmUsd = Number(payload.data?.amount);
      if (!Number.isFinite(xlmUsd) || xlmUsd <= 0) throw new Error("Invalid backup rate");
      return { "XLM-USD": xlmUsd };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Shared cache and bounded refresh; no guessed rates when the feed fails. */
export function useCurrencyTicker() {
  return useQuery({
    queryKey: ["currency-ticker", "xlm-usdc", "usd-eur-gbp-cad"],
    queryFn: fetchTickerRates,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
