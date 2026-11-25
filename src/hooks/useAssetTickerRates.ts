"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TICKER_PRICE_URL,
  TICKER_REFETCH_INTERVAL_MS,
  TICKER_STALE_TIME_MS,
  parseTickerPrices,
  readTickerCache,
  resolveTickerView,
  writeTickerCache,
  type TickerSnapshot,
  type TickerView,
} from "@/lib/assetTicker";
import { HttpStatusError, parseRetryAfter } from "@/lib/retryPolicy";

export const ASSET_TICKER_QUERY_KEY = ["assetTicker", "usd"] as const;

/**
 * Fetch USD reference prices for the settlement assets.
 *
 * Non-2xx responses throw `HttpStatusError` so the global retry policy
 * (#900) can tell a rate limit or outage (retried with backoff) from a bad
 * request (failed fast). A successful fetch is persisted as the last-known
 * snapshot for offline and failed-poll renders.
 */
export async function fetchTickerSnapshot(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<TickerSnapshot> {
  const res = await fetchImpl(TICKER_PRICE_URL, {
    signal: AbortSignal.timeout(8_000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new HttpStatusError(
      res.status,
      `Price feed responded ${res.status}`,
      parseRetryAfter(res.headers?.get?.("retry-after"))
    );
  }
  const prices = parseTickerPrices(await res.json());
  if (!prices) throw new Error("Price feed returned an unexpected payload");
  const snapshot = { prices, fetchedAt: now() };
  writeTickerCache(snapshot);
  return snapshot;
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export interface AssetTickerRates extends TickerView {
  isFetching: boolean;
  refetch: () => void;
}

/**
 * Live XLM/USD and USDC/XLM rates with a last-known fallback (#904).
 *
 * Polls every minute while the tab is visible. When a poll fails or the
 * device is offline, the previous successful rates (in memory, or from
 * localStorage on a cold start) stay on screen and the view is flagged
 * `stale` instead of disappearing.
 */
export function useAssetTickerRates(): AssetTickerRates {
  const online = useOnlineStatus();
  // Read the persisted snapshot after mount so the server render and the
  // first client render agree (no hydration mismatch).
  const [cached, setCached] = useState<TickerSnapshot | null>(null);
  useEffect(() => {
    setCached(readTickerCache());
  }, []);

  const query = useQuery({
    queryKey: ASSET_TICKER_QUERY_KEY,
    queryFn: () => fetchTickerSnapshot(),
    staleTime: TICKER_STALE_TIME_MS,
    refetchInterval: TICKER_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    throwOnError: false,
  });

  const view = resolveTickerView({
    current: query.data,
    cached,
    isError: query.isError,
    isLoading: query.isPending && query.fetchStatus === "fetching",
    isOnline: online,
  });

  return {
    ...view,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
  };
}
