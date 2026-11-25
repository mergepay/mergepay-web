import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { CurrencyTicker } from "@/components/CurrencyTicker";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("CurrencyTicker", () => {
  // The rate hook fetches CoinGecko; answer it locally so the test never
  // depends on a third-party API's latency or rate limits. Without this the
  // rows stay in their loading state for as long as the real request takes,
  // which made the 1s `findByText` window flaky in CI.
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ stellar: { usd: 0.12 }, "usd-coin": { usd: 1 } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders exchange rates for XLM and USDC", async () => {
    renderWithClient(<CurrencyTicker />);
    expect(await screen.findByText(/Live Rates/i)).toBeDefined();
    expect(await screen.findByText(/XLM/i)).toBeDefined();
    expect(await screen.findByText(/USDC/i)).toBeDefined();
  });
});
