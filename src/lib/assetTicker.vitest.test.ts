import { describe, expect, it } from "vitest";
import {
  PRIMARY_TICKER_PAIRS,
  TICKER_CACHE_KEY,
  TICKER_STALE_AFTER_MS,
  buildTickerQuotes,
  formatPairRate,
  formatRateAge,
  pairRate,
  parseTickerPrices,
  readTickerCache,
  resolveTickerView,
  writeTickerCache,
  type TickerSnapshot,
} from "./assetTicker";

const PRICES = { XLM: 0.125, USDC: 1 };
const NOW = Date.parse("2026-11-24T12:00:00Z");

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("pair maths", () => {
  it("supports the primary XLM/USD and USDC/XLM pairs", () => {
    expect(PRIMARY_TICKER_PAIRS.map((p) => `${p.base}/${p.quote}`)).toEqual([
      "XLM/USD",
      "USDC/XLM",
    ]);
  });

  it("derives each pair from USD prices", () => {
    expect(pairRate({ base: "XLM", quote: "USD" }, PRICES)).toBeCloseTo(0.125);
    expect(pairRate({ base: "USDC", quote: "XLM" }, PRICES)).toBeCloseTo(8);
    expect(buildTickerQuotes(PRICES).map((q) => [q.label, q.rate])).toEqual([
      ["XLM/USD", 0.125],
      ["USDC/XLM", 8],
    ]);
  });
});

describe("formatPairRate", () => {
  it("prefixes USD quotes and suffixes asset quotes", () => {
    expect(formatPairRate(0.125, "USD")).toBe("$0.125");
    expect(formatPairRate(8, "XLM")).toBe("8.00 XLM");
    expect(formatPairRate(8.123456, "XLM")).toBe("8.1235 XLM");
  });

  it("keeps sub-cent precision and groups large values", () => {
    expect(formatPairRate(0.000123, "USD")).toBe("$0.000123");
    expect(formatPairRate(12345.678, "XLM")).toBe("12,345.68 XLM");
  });

  it("renders a dash for invalid rates", () => {
    expect(formatPairRate(Number.NaN, "USD")).toBe("—");
    expect(formatPairRate(0, "USD")).toBe("—");
    expect(formatPairRate(-1, "XLM")).toBe("—");
  });

  it("formats the age of stale rates", () => {
    expect(formatRateAge(NOW - 10_000, NOW)).toBe("just now");
    expect(formatRateAge(NOW - 3 * 60_000, NOW)).toBe("3 min ago");
    expect(formatRateAge(NOW - 2 * 3_600_000, NOW)).toBe("2 h ago");
    expect(formatRateAge(NOW - 3 * 86_400_000, NOW)).toBe("3 d ago");
  });
});

describe("resolveTickerView fallback behaviour", () => {
  const fresh: TickerSnapshot = { prices: PRICES, fetchedAt: NOW - 1_000 };
  const old: TickerSnapshot = { prices: { XLM: 0.1, USDC: 1 }, fetchedAt: NOW - 3_600_000 };
  const base = { isError: false, isLoading: false, isOnline: true, now: NOW };

  it("is live with a fresh successful poll", () => {
    const view = resolveTickerView({ ...base, current: fresh, cached: null });
    expect(view.status).toBe("live");
    expect(view.quotes[0].rate).toBeCloseTo(0.125);
  });

  it("shows a skeleton while the first fetch is in flight with no cache", () => {
    const view = resolveTickerView({ ...base, isLoading: true, current: null, cached: null });
    expect(view).toEqual({ status: "loading", quotes: [], updatedAt: null });
  });

  it("renders cached rates flagged stale when the poll fails", () => {
    const view = resolveTickerView({ ...base, isError: true, current: null, cached: old });
    expect(view.status).toBe("stale");
    expect(view.updatedAt).toBe(old.fetchedAt);
    expect(view.quotes[1].rate).toBeCloseTo(10);
  });

  it("keeps last-known rates but flags them stale when a later poll fails", () => {
    const view = resolveTickerView({ ...base, isError: true, current: fresh, cached: old });
    expect(view.status).toBe("stale");
    expect(view.updatedAt).toBe(fresh.fetchedAt);
  });

  it("is stale while offline, even with recent data", () => {
    expect(resolveTickerView({ ...base, isOnline: false, current: fresh, cached: null }).status).toBe(
      "stale"
    );
  });

  it("is stale when the data has aged past the threshold", () => {
    const aged = { prices: PRICES, fetchedAt: NOW - TICKER_STALE_AFTER_MS - 1 };
    expect(resolveTickerView({ ...base, current: aged, cached: null }).status).toBe("stale");
  });

  it("uses cached rates (stale) while the first live fetch is still loading", () => {
    const view = resolveTickerView({ ...base, isLoading: true, current: null, cached: old });
    expect(view.status).toBe("stale");
    expect(view.quotes).toHaveLength(2);
  });

  it("is unavailable when there is nothing to show", () => {
    expect(resolveTickerView({ ...base, isError: true, current: null, cached: null }).status).toBe(
      "unavailable"
    );
    expect(
      resolveTickerView({ ...base, isLoading: true, isOnline: false, current: null, cached: null }).status
    ).toBe("unavailable");
  });

  it("ignores malformed snapshots", () => {
    const broken = { prices: { XLM: 0, USDC: 1 }, fetchedAt: NOW } as TickerSnapshot;
    expect(resolveTickerView({ ...base, isError: true, current: broken, cached: null }).status).toBe(
      "unavailable"
    );
  });
});

describe("last-known-rates cache", () => {
  it("round-trips a snapshot", () => {
    const storage = memoryStorage();
    writeTickerCache({ prices: PRICES, fetchedAt: NOW }, storage);
    expect(readTickerCache(storage)).toEqual({ prices: PRICES, fetchedAt: NOW });
  });

  it("rejects malformed or corrupt entries", () => {
    expect(readTickerCache(memoryStorage({ [TICKER_CACHE_KEY]: "{not json" }))).toBeNull();
    expect(
      readTickerCache(
        memoryStorage({ [TICKER_CACHE_KEY]: JSON.stringify({ prices: { XLM: -1, USDC: 1 }, fetchedAt: NOW }) })
      )
    ).toBeNull();
    expect(readTickerCache(memoryStorage())).toBeNull();
    expect(readTickerCache(null)).toBeNull();
  });

  it("swallows storage write failures", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => writeTickerCache({ prices: PRICES, fetchedAt: NOW }, storage)).not.toThrow();
  });
});

describe("parseTickerPrices", () => {
  it("parses the CoinGecko payload", () => {
    expect(parseTickerPrices({ stellar: { usd: 0.12 }, "usd-coin": { usd: 1 } })).toEqual({
      XLM: 0.12,
      USDC: 1,
    });
  });

  it("rejects incomplete payloads", () => {
    expect(parseTickerPrices({ stellar: { usd: 0.12 } })).toBeNull();
    expect(parseTickerPrices(null)).toBeNull();
    expect(parseTickerPrices("nope")).toBeNull();
  });
});
