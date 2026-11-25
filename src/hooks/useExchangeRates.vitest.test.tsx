import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useExchangeRates, fallbackExchangeRates, ExchangeRatesSchema } from "./useExchangeRates";

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

describe("useExchangeRates hook with multi-source fallbacks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns fallback rates immediately", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useExchangeRates(), { wrapper });

    expect(result.current.rates).toBeDefined();
    expect(result.current.rates["XLM-USDC"]).toBe(0.12);
    expect(result.current.isLive).toBe(false);
  });

  it("validates rates payload via Zod schema successfully", () => {
    const fallback = fallbackExchangeRates();
    const parsed = ExchangeRatesSchema.safeParse(fallback);
    expect(parsed.success).toBe(true);
  });

  it("fetches live rates from primary CoinGecko API successfully", async () => {
    const mockData = {
      stellar: { usd: 0.15 },
      "usd-coin": { usd: 1.0 },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useExchangeRates(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLive).toBe(true);
    });

    expect(result.current.rates["XLM-USDC"]).toBe(0.15);
  });

  it("falls back to secondary provider when primary fails", async () => {
    // Primary fails
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockRejectedValueOnce(new Error("Primary API down"));

    // Secondary succeeds
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { amount: "0.14" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useExchangeRates(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLive).toBe(true);
    });

    expect(result.current.rates["XLM-USDC"]).toBe(0.14);
  });

  it("retains fallback rates gracefully when all providers fail", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network offline"));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useExchangeRates(), { wrapper });

    // Should remain on fallback without throwing
    await waitFor(() => {
      expect(result.current.rates["XLM-USDC"]).toBe(0.12);
    });

    expect(result.current.rates["XLM-USDC"]).toBe(0.12);
    expect(result.current.isLive).toBe(false);
  });
});
