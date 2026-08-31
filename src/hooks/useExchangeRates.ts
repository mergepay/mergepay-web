"use client";

import { useQuery } from "@tanstack/react-query";
import type { ExchangeRates } from "../lib/exchange";

/**
 * Fallback indicative exchange rates between major Stellar trustlines (XLM, USDC).
 */
function fallbackExchangeRates(): ExchangeRates {
  return {
    rates: {
      "XLM-USDC": 0.12,
      "USDC-XLM": 8.3333333,
      "XLM-XLM": 1.0,
      "USDC-USDC": 1.0,
    },
    live: false,
    timestamp: Date.now(),
  };
}

async function fetchExchangeRates(): Promise<ExchangeRates> {
  // Query CoinGecko or Horizon dex price endpoints for live cross-rates
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=usd", {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    throw new Error(`Exchange rate API responded with status ${res.status}`);
  }
  const data = (await res.json()) as Record<string, { usd?: number }>;
  const xlmUsd = data["stellar"]?.usd;
  const usdcUsd = data["usd-coin"]?.usd;

  if (typeof xlmUsd !== "number" || typeof usdcUsd !== "number" || usdcUsd <= 0) {
    throw new Error("Invalid exchange rate response shape");
  }

  const xlmToUsdc = xlmUsd / usdcUsd;
  const usdcToXlm = usdcToUsdc > 0 ? 1 / xlmToUsdc : 8.3333333;

  return {
    rates: {
      "XLM-USDC": xlmToUsdc,
      "USDC-XLM": usdcToXlm,
      "XLM-XLM": 1.0,
      "USDC-USDC": 1.0,
    },
    live: true,
    timestamp: Date.now(),
  };
}

/**
 * React hook leveraging TanStack React Query to fetch and cache current exchange rates
 * for multi-currency group expenses and trustline settlements.
 */
export function useExchangeRates() {
  const query = useQuery<ExchangeRates>({
    queryKey: ["exchangeRates"],
    queryFn: fetchExchangeRates,
    placeholderData: fallbackExchangeRates,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: 1,
    throwOnError: false,
  });

  const exchangeData = query.data ?? fallbackExchangeRates();

  return {
    rates: exchangeData.rates,
    isLive: exchangeData.live,
    timestamp: exchangeData.timestamp,
    isFetching: query.isFetching,
    error: query.error,
  };
}
