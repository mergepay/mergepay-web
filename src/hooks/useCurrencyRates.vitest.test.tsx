import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCurrencyRates, convertToFiat } from "./useCurrencyRates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// convertToFiat (pure utility)
// ---------------------------------------------------------------------------

describe("convertToFiat", () => {
  const rates = { xlm: 0.12, usdc: 1.0, live: true };

  it("converts XLM amount to fiat", () => {
    expect(convertToFiat("10", "XLM", rates)).toBe("1.20");
  });

  it("converts USDC amount to fiat", () => {
    expect(convertToFiat("25.5", "USDC", rates)).toBe("25.50");
  });

  it("returns null for unparseable amounts", () => {
    expect(convertToFiat("abc", "XLM", rates)).toBeNull();
  });

  it("returns null for unknown asset codes", () => {
    expect(convertToFiat("10", "BTC", rates)).toBeNull();
  });

  it("returns null for negative amounts", () => {
    expect(convertToFiat("-5", "XLM", rates)).toBeNull();
  });

  it("handles numeric inputs", () => {
    expect(convertToFiat(10, "XLM", rates)).toBe("1.20");
  });

  it("returns null when rate is zero", () => {
    expect(convertToFiat("10", "XLM", { xlm: 0, usdc: 1, live: false })).toBeNull();
  });

  it("handles zero amount", () => {
    expect(convertToFiat("0", "XLM", rates)).toBe("0.00");
  });

  it("is case-insensitive for asset codes", () => {
    expect(convertToFiat("10", "xlm", rates)).toBe("1.20");
    expect(convertToFiat("10", "usdc", rates)).toBe("10.00");
  });
});

// ---------------------------------------------------------------------------
// useCurrencyRates hook
// ---------------------------------------------------------------------------

describe("useCurrencyRates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns placeholder data immediately (fallback rates)", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCurrencyRates("USD"), { wrapper });

    // Should have rates immediately from placeholderData
    expect(result.current.rates).toBeDefined();
    expect(result.current.rates.xlm).toBeGreaterThan(0);
    expect(result.current.rates.usdc).toBeGreaterThan(0);
  });

  it("returns live=false for initial placeholder data", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCurrencyRates("USD"), { wrapper });

    // Placeholder data is fallback → live=false
    expect(result.current.isLive).toBe(false);
  });

  it("returns correct fallback rates for each currency", () => {
    const wrapper = createWrapper();

    const { result: usd } = renderHook(() => useCurrencyRates("USD"), { wrapper });
    expect(usd.current.rates.usdc).toBe(1.0);

    const { result: eur } = renderHook(() => useCurrencyRates("EUR"), { wrapper });
    expect(eur.current.rates.usdc).toBe(0.92);

    const { result: gbp } = renderHook(() => useCurrencyRates("GBP"), { wrapper });
    expect(gbp.current.rates.usdc).toBe(0.79);
  });

  it("fetches live rates from CoinGecko when fetch succeeds", async () => {
    const mockData = {
      stellar: { usd: 0.15 },
      "usd-coin": { usd: 1.01 },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCurrencyRates("USD"), { wrapper });

    // Initially shows fallback
    expect(result.current.rates.xlm).toBe(0.12);

    // Wait for the live fetch to complete
    await waitFor(() => {
      expect(result.current.isLive).toBe(true);
    });

    expect(result.current.rates.xlm).toBe(0.15);
    expect(result.current.rates.usdc).toBe(1.01);
  });

  it("falls back gracefully when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCurrencyRates("USD"), { wrapper });

    // Should still have fallback rates
    expect(result.current.rates).toBeDefined();
    expect(result.current.rates.xlm).toBeGreaterThan(0);
  });
});
