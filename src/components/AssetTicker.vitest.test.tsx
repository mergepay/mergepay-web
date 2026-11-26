import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AssetTicker } from "./AssetTicker";
import type { AssetTickerRates } from "@/hooks/useAssetTickerRates";
import { fetchTickerSnapshot } from "@/hooks/useAssetTickerRates";
import { TICKER_CACHE_KEY, buildTickerQuotes } from "@/lib/assetTicker";
import { HttpStatusError } from "@/lib/retryPolicy";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const PRICES = { XLM: 0.125, USDC: 1 };

function rates(overrides: Partial<AssetTickerRates>): AssetTickerRates {
  return {
    status: "live",
    quotes: buildTickerQuotes(PRICES),
    updatedAt: NOW,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("AssetTicker rendering", () => {
  it("renders XLM/USD and USDC/XLM with a Live badge", () => {
    render(<AssetTicker rates={rates({})} now={NOW} />);
    expect(screen.getByTestId("asset-ticker-pair-XLM-USD")).toHaveTextContent("XLM/USD");
    expect(screen.getByTestId("asset-ticker-pair-XLM-USD")).toHaveTextContent("$0.125");
    expect(screen.getByTestId("asset-ticker-pair-USDC-XLM")).toHaveTextContent("8.00 XLM");
    expect(screen.getByTestId("asset-ticker-status")).toHaveTextContent(/live/i);
  });

  it("renders skeletons while loading", () => {
    render(<AssetTicker rates={rates({ status: "loading", quotes: [], updatedAt: null })} />);
    expect(screen.getAllByTestId("asset-ticker-skeleton")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent(/loading exchange rates/i);
    expect(screen.queryByRole("list", { name: /exchange rates/i })).not.toBeInTheDocument();
  });

  it("renders last-known rates with a stale indicator and their age", () => {
    render(
      <AssetTicker rates={rates({ status: "stale", updatedAt: NOW - 5 * 60_000 })} now={NOW} />
    );
    const badge = screen.getByTestId("asset-ticker-status");
    expect(badge).toHaveTextContent(/stale/i);
    expect(badge).toHaveTextContent("5 min ago");
    expect(screen.getByTestId("asset-ticker-pair-XLM-USD")).toHaveTextContent("$0.125");
    expect(screen.getByTestId("asset-ticker")).toHaveAttribute("data-status", "stale");
  });

  it("offers a retry when no rates are available", () => {
    const refetch = vi.fn();
    render(
      <AssetTicker rates={rates({ status: "unavailable", quotes: [], updatedAt: null, refetch })} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/i);
    fireEvent.click(screen.getByRole("button", { name: /refresh exchange rates/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("AssetTicker with the live feed", () => {
  it("fetches and shows live rates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ stellar: { usd: 0.2 }, "usd-coin": { usd: 1 } }), {
          status: 200,
        })
      )
    );
    render(withClient(<AssetTicker />));
    await waitFor(() =>
      expect(screen.getByTestId("asset-ticker-status")).toHaveTextContent(/live/i)
    );
    expect(screen.getByTestId("asset-ticker-pair-USDC-XLM")).toHaveTextContent("5.00 XLM");
    expect(JSON.parse(window.localStorage.getItem(TICKER_CACHE_KEY) ?? "{}").prices).toEqual({
      XLM: 0.2,
      USDC: 1,
    });
  });

  it("falls back to cached rates marked stale when the feed fails", async () => {
    window.localStorage.setItem(
      TICKER_CACHE_KEY,
      JSON.stringify({ prices: { XLM: 0.1, USDC: 1 }, fetchedAt: Date.now() - 60_000 })
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    render(withClient(<AssetTicker />));
    await waitFor(() =>
      expect(screen.getByTestId("asset-ticker-status")).toHaveTextContent(/stale/i)
    );
    expect(screen.getByTestId("asset-ticker-pair-USDC-XLM")).toHaveTextContent("10.00 XLM");
  });

  it("shows unavailable when the feed fails with nothing cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(withClient(<AssetTicker />));
    await waitFor(() =>
      expect(screen.getByTestId("asset-ticker-status")).toHaveTextContent(/unavailable/i)
    );
  });
});

describe("fetchTickerSnapshot", () => {
  it("throws an HttpStatusError carrying Retry-After for rate limits", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "12" } }));
    await expect(fetchTickerSnapshot(fetchImpl as typeof fetch)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 12,
    });
    await expect(fetchTickerSnapshot(fetchImpl as typeof fetch)).rejects.toBeInstanceOf(
      HttpStatusError
    );
  });

  it("rejects malformed payloads", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(fetchTickerSnapshot(fetchImpl as typeof fetch)).rejects.toThrow(/unexpected/i);
  });
});
