"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { ExchangeRates } from "../lib/exchange";

/**
 * Zod schema for validating exchange rate payloads from providers.
 */
export const ExchangeRatesSchema = z.object({
  rates: z.record(z.string(), z.number()),
  live: z.boolean(),
  timestamp: z.number(),
});

/**
 * Fallback indicative exchange rates between major Stellar trustlines (XLM, USDC).
 */
export function fallbackExchangeRates(): ExchangeRates {
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

async function fetchCoinGeckoRates(): Promise<ExchangeRates> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=stellar,usd-coin&vs_currencies=usd",
    {
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!res.ok) {
    throw new Error(`CoinGecko responded with status ${res.status}`);
  }
  const data = (await res.json()) as Record<string, { usd?: number }>;
  const xlmUsd = data["stellar"]?.usd;
  const usdcUsd = data["usd-coin"]?.usd;

  if (typeof xlmUsd !== "number" || typeof usdcUsd !== "number" || usdcUsd <= 0) {
    throw new Error("Invalid CoinGecko rate response shape");
  }

  const xlmToUsdc = xlmUsd / usdcUsd;
  const usdcToXlm = usdcUsd > 0 ? 1 / xlmToUsdc : 8.3333333;

  const payload: ExchangeRates = {
    rates: {
      "XLM-USDC": xlmToUsdc,
      "USDC-XLM": usdcToXlm,
      "XLM-XLM": 1.0,
      "USDC-USDC": 1.0,
    },
    live: true,
    timestamp: Date.now(),
  };

  return ExchangeRatesSchema.parse(payload);
}

async function fetchHorizonRates(): Promise<ExchangeRates> {
  // Fallback primary DEX pricing source using Stellar Horizon / or secondary API
  const res = await fetch(
    "https://api.coinbase.com/v2/prices/XLM-USD/spot",
    {
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!res.ok) {
    throw new Error(`Coinbase fallback responded with status ${res.status}`);
  }
  const json = (await res.json()) as { data?: { amount?: string } };
  const amountStr = json.data?.amount;
  const xlmUsd = amountStr ? parseFloat(amountStr) : NaN;

  if (Number.isNaN(xlmUsd) || xlmUsd <= 0) {
    throw new Error("Invalid Coinbase fallback rate response");
  }

  const payload: ExchangeRates = {
    rates: {
      "XLM-USDC": xlmUsd,
      "USDC-XLM": xlmUsd > 0 ? 1 / xlmUsd : 8.3333333,
      "XLM-XLM": 1.0,
      "USDC-USDC": 1.0,
    },
    live: true,
    timestamp: Date.now(),
  };

  return ExchangeRatesSchema.parse(payload);
}

async function fetchExchangeRatesWithFallbacks(): Promise<ExchangeRates> {
  try {
    return await fetchCoinGeckoRates();
  } catch (err1) {
    try {
      return await fetchHorizonRates();
    } catch (err2) {
      throw new Error(`All exchange rate providers failed: ${err1}, ${err2}`);
    }
  }
}

/**
 * React hook leveraging TanStack React Query to fetch and cache current exchange rates
 * for multi-currency group expenses and trustline settlements with multi-source fallbacks.
 */
export function useExchangeRates() {
  const query = useQuery<ExchangeRates>({
    queryKey: ["exchangeRates"],
    queryFn: fetchExchangeRatesWithFallbacks,
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
