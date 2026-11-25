import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurrencyConverter } from "./CurrencyConverter";
import * as hooks from "@/hooks/useExchangeRates";

vi.mock("@/hooks/useExchangeRates");

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CurrencyConverter Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(hooks, "useExchangeRates").mockReturnValue({
      rates: {
        "XLM-USDC": 0.12,
        "USDC-XLM": 8.3333333,
        "USD-USDC": 1.0,
        "USDC-USD": 1.0,
        "USD-XLM": 8.3333333,
        "XLM-USD": 0.12,
      },
      isLive: true,
      timestamp: Date.now(),
      isFetching: false,
      error: null,
    });
  });

  it("renders currency converter with inputs and calculated conversion", () => {
    renderWithClient(
      <CurrencyConverter
        defaultAmount="100"
        defaultSourceCurrency="USD"
        defaultTargetCurrency="USDC"
      />
    );

    expect(screen.getByTestId("currency-converter")).toBeInTheDocument();
    expect(screen.getByTestId("converter-source-input")).toHaveValue(100);
    expect(screen.getByTestId("converter-target-output")).toHaveTextContent("100");
    expect(screen.getByText("Live DEX Rates")).toBeInTheDocument();
  });

  it("calculates conversion when source amount changes", () => {
    renderWithClient(
      <CurrencyConverter
        defaultAmount="50"
        defaultSourceCurrency="USD"
        defaultTargetCurrency="USDC"
      />
    );

    const input = screen.getByTestId("converter-source-input");
    fireEvent.change(input, { target: { value: "200" } });

    expect(screen.getByTestId("converter-target-output")).toHaveTextContent("200");
  });

  it("swaps currencies when swap button is clicked", () => {
    renderWithClient(
      <CurrencyConverter
        defaultAmount="100"
        defaultSourceCurrency="USD"
        defaultTargetCurrency="USDC"
      />
    );

    const swapBtn = screen.getByTestId("converter-swap-btn");
    fireEvent.click(swapBtn);

    expect(screen.getByTestId("converter-source-select")).toHaveValue("USDC");
    expect(screen.getByTestId("converter-target-select")).toHaveValue("USD");
  });

  it("triggers onApply callback when Use in Expense button is clicked", () => {
    const handleApply = vi.fn();
    renderWithClient(
      <CurrencyConverter
        defaultAmount="100"
        defaultSourceCurrency="USD"
        defaultTargetCurrency="USDC"
        onApply={handleApply}
      />
    );

    const applyBtn = screen.getByTestId("converter-apply-btn");
    fireEvent.click(applyBtn);

    expect(handleApply).toHaveBeenCalledWith("100.0000000", "USDC");
  });
});
