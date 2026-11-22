import { describe, it, expect } from "vitest";
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
  it("renders exchange rates for XLM and USDC", async () => {
    renderWithClient(<CurrencyTicker />);
    expect(await screen.findByText(/Live Rates/i)).toBeDefined();
    expect(await screen.findByText(/XLM/i)).toBeDefined();
    expect(await screen.findByText(/USDC/i)).toBeDefined();
  });
});
