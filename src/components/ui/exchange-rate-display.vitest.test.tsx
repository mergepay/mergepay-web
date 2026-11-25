import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExchangeRateDisplay } from "./exchange-rate-display";

describe("ExchangeRateDisplay Component (Issue #220)", () => {
  it("renders live exchange rate with live badge in card variant", () => {
    render(
      <ExchangeRateDisplay
        sourceCurrency="USD"
        targetCurrency="USDC"
        rate={1.0}
        sourceAmount="100"
        targetAmount="100.0000000"
        isLive={true}
      />
    );

    expect(screen.getByTestId("exchange-rate-display")).toBeInTheDocument();
    expect(screen.getByTestId("rate-live-badge")).toHaveTextContent("Live DEX Rate");
    expect(screen.getByText("1 USD = 1.0000 USDC")).toBeInTheDocument();
    expect(screen.getByText("100 USD")).toBeInTheDocument();
    expect(screen.getByText("≈ 100.0000000 USDC")).toBeInTheDocument();
  });

  it("renders fallback indicator when rate is not live or API failed", () => {
    render(
      <ExchangeRateDisplay
        sourceCurrency="XLM"
        targetCurrency="USDC"
        rate={0.12}
        isLive={false}
        isFallback={true}
      />
    );

    expect(screen.getByTestId("rate-fallback-badge")).toHaveTextContent("Indicative Rate");
    expect(screen.getByTestId("rate-fallback-notice")).toHaveTextContent(
      "Live rate API temporarily unavailable. Using indicative reference rates."
    );
  });

  it("renders offline estimate when isOffline is true", () => {
    render(
      <ExchangeRateDisplay
        sourceCurrency="USD"
        targetCurrency="XLM"
        rate={8.3333}
        isOffline={true}
      />
    );

    expect(screen.getByTestId("rate-fallback-badge")).toHaveTextContent("Offline");
    expect(screen.getByTestId("rate-fallback-notice")).toHaveTextContent(
      "Your device is offline. Showing cached indicative conversion rates."
    );
  });

  it("renders compact variant with fallback indicator", () => {
    render(
      <ExchangeRateDisplay
        sourceCurrency="EUR"
        targetCurrency="USD"
        rate={1.08}
        isFallback={true}
        variant="compact"
      />
    );

    expect(screen.getByTestId("exchange-rate-compact")).toBeInTheDocument();
    expect(screen.getByTestId("rate-fallback-indicator")).toHaveTextContent("Indicative Rate");
  });

  it("renders badge variant correctly", () => {
    render(
      <ExchangeRateDisplay
        sourceCurrency="USD"
        targetCurrency="USDC"
        rate={1.0}
        variant="badge"
      />
    );

    expect(screen.getByTestId("exchange-rate-badge")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});
