/**
 * Pure logic behind the multi-asset exchange-rate ticker (#904).
 *
 * The ticker shows the primary Stellar trading pairs (XLM/USD and USDC/XLM)
 * before a user settles. It must keep rendering useful numbers when the price
 * feed is slow, offline or failing — so the pair maths, the formatting, the
 * "live vs stale" decision and the last-known-rates cache all live here,
 * free of React and React Query, and are unit-tested directly.
 */

import type {
  AssetTickerPair,
  AssetUsdPrices,
  SettlementAssetCode,
  TickerQuoteCode,
} from "./types";

/** The pairs the ticker shows, in display order. */
export const PRIMARY_TICKER_PAIRS: readonly AssetTickerPair[] = [
  { base: "XLM", quote: "USD" },
  { base: "USDC", quote: "XLM" },
] as const;

/** How often the ticker polls the price feed. */
export const TICKER_REFETCH_INTERVAL_MS = 60_000;

/** How long fetched prices are considered fresh by React Query. */
export const TICKER_STALE_TIME_MS = 30_000;

/**
 * Rates older than this are labelled stale even if the last poll succeeded —
 * e.g. the tab was asleep, or polling has silently stopped.
 */
export const TICKER_STALE_AFTER_MS = 5 * 60_000;

/** localStorage key holding the last successfully fetched prices. */
export const TICKER_CACHE_KEY = "mergepay:asset-ticker:v1";

export interface TickerQuote {
  pair: AssetTickerPair;
  /** `"XLM/USD"` */
  label: string;
  /** Units of `quote` for one unit of `base`. */
  rate: number;
}

/** A set of prices plus when they were fetched (epoch ms). */
export interface TickerSnapshot {
  prices: AssetUsdPrices;
  fetchedAt: number;
}

export type TickerStatus = "loading" | "live" | "stale" | "unavailable";

export interface TickerView {
  status: TickerStatus;
  quotes: TickerQuote[];
  /** When the rates on screen were fetched, or `null` if there are none. */
  updatedAt: number | null;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Whether a price payload has a usable price for every settlement asset. */
export function isValidPrices(value: unknown): value is AssetUsdPrices {
  if (typeof value !== "object" || value === null) return false;
  const prices = value as Record<string, unknown>;
  return isPositiveFinite(prices.XLM) && isPositiveFinite(prices.USDC);
}

function usdPrice(code: TickerQuoteCode, prices: AssetUsdPrices): number {
  return code === "USD" ? 1 : prices[code];
}

/** Units of `pair.quote` per one `pair.base`, derived from USD prices. */
export function pairRate(pair: AssetTickerPair, prices: AssetUsdPrices): number {
  return usdPrice(pair.base, prices) / usdPrice(pair.quote, prices);
}

/** Build the display quotes for `pairs` from a set of USD prices. */
export function buildTickerQuotes(
  prices: AssetUsdPrices,
  pairs: readonly AssetTickerPair[] = PRIMARY_TICKER_PAIRS
): TickerQuote[] {
  return pairs.map((pair) => ({
    pair,
    label: `${pair.base}/${pair.quote}`,
    rate: pairRate(pair, prices),
  }));
}

/**
 * Format a pair rate for a compact badge.
 *
 * USD quotes get a `$` prefix; asset quotes get the asset code as a suffix.
 * Precision adapts to magnitude so a sub-cent price never collapses to
 * `0.00` and a large one stays readable.
 */
export function formatPairRate(rate: number, quote: TickerQuoteCode): string {
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  const digits = rate >= 1000 ? 2 : rate >= 0.01 ? 4 : 6;
  const number = rate.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  });
  return quote === "USD" ? `$${number}` : `${number} ${quote}`;
}

/** Short relative age for the stale indicator: "just now", "3 min ago", "2 h ago". */
export function formatRateAge(updatedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export interface ResolveTickerInput {
  /** Latest snapshot React Query holds (live or from a previous success). */
  current: TickerSnapshot | null | undefined;
  /** Snapshot read back from localStorage, used before the first success. */
  cached: TickerSnapshot | null | undefined;
  /** Whether the most recent fetch attempt failed. */
  isError: boolean;
  /** Whether a first fetch is still in flight. */
  isLoading: boolean;
  /** `navigator.onLine` at render time. */
  isOnline: boolean;
  now?: number;
  staleAfterMs?: number;
}

/**
 * Decide what the ticker shows.
 *
 *  - fresh data from a successful poll, online      → `live`
 *  - the last poll failed, we're offline, or the
 *    data is older than `staleAfterMs`              → `stale` with last-known rates
 *  - no data at all but a fetch is in flight        → `loading` (skeleton)
 *  - no data, no cache, and the fetch failed        → `unavailable`
 *
 * The newest of the in-memory and persisted snapshots wins, so a stale cache
 * never overrides a fresher poll.
 */
export function resolveTickerView({
  current,
  cached,
  isError,
  isLoading,
  isOnline,
  now = Date.now(),
  staleAfterMs = TICKER_STALE_AFTER_MS,
}: ResolveTickerInput): TickerView {
  const candidates = [current, cached].filter(
    (snapshot): snapshot is TickerSnapshot =>
      Boolean(snapshot) && isValidPrices(snapshot?.prices)
  );
  const best = candidates.sort((a, b) => b.fetchedAt - a.fetchedAt)[0] ?? null;

  if (!best) {
    if (isLoading && isOnline) {
      return { status: "loading", quotes: [], updatedAt: null };
    }
    return { status: "unavailable", quotes: [], updatedAt: null };
  }

  const fromLivePoll = Boolean(current) && best === current;
  const tooOld = now - best.fetchedAt > staleAfterMs;
  const stale = !fromLivePoll || isError || !isOnline || tooOld;

  return {
    status: stale ? "stale" : "live",
    quotes: buildTickerQuotes(best.prices),
    updatedAt: best.fetchedAt,
  };
}

// ---------------------------------------------------------------------------
// last-known-rates cache
// ---------------------------------------------------------------------------

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage throws in some privacy modes.
    return null;
  }
}

/** Read the last persisted snapshot, or `null` if missing or malformed. */
export function readTickerCache(storage: StorageLike | null = defaultStorage()): TickerSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(TICKER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TickerSnapshot>;
    if (!isValidPrices(parsed.prices) || !isPositiveFinite(parsed.fetchedAt)) {
      return null;
    }
    return { prices: { XLM: parsed.prices.XLM, USDC: parsed.prices.USDC }, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

/** Persist a snapshot so the next visit (or an offline reload) has rates. */
export function writeTickerCache(
  snapshot: TickerSnapshot,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage || !isValidPrices(snapshot.prices)) return;
  try {
    storage.setItem(TICKER_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded or storage disabled — the ticker still works in memory.
  }
}

// ---------------------------------------------------------------------------
// price feed
// ---------------------------------------------------------------------------

/** CoinGecko ids for the settlement assets. */
export const COINGECKO_IDS: Record<SettlementAssetCode, string> = {
  XLM: "stellar",
  USDC: "usd-coin",
};

export const TICKER_PRICE_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS.XLM},${COINGECKO_IDS.USDC}&vs_currencies=usd`;

/** Parse CoinGecko's `{ stellar: { usd }, "usd-coin": { usd } }` payload. */
export function parseTickerPrices(data: unknown): AssetUsdPrices | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, { usd?: unknown } | undefined>;
  const prices = {
    XLM: record[COINGECKO_IDS.XLM]?.usd,
    USDC: record[COINGECKO_IDS.USDC]?.usd,
  };
  return isValidPrices(prices) ? prices : null;
}
