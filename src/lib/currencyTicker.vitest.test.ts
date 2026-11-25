import { describe, expect, it } from "vitest";
import {
  FALLBACK_TICKER_FIAT_RATES,
  buildTickerRates,
  formatTickerRate,
} from "./currencyTicker";

describe("currency ticker (#888)", () => {
  it("uses the live rates when both legs are valid", () => {
    expect(buildTickerRates({ xlm: 0.25, usdc: 1.01, live: true })).toEqual([
      { assetCode: "XLM", rate: 0.25 },
      { assetCode: "USDC", rate: 1.01 },
    ]);
  });

  it("falls back to indicative values when the feed is missing", () => {
    expect(buildTickerRates(null)).toEqual([
      { assetCode: "XLM", rate: FALLBACK_TICKER_FIAT_RATES.xlm },
      { assetCode: "USDC", rate: FALLBACK_TICKER_FIAT_RATES.usdc },
    ]);
    expect(buildTickerRates(undefined)).toEqual(
      buildTickerRates(FALLBACK_TICKER_FIAT_RATES)
    );
  });

  it("rejects a partially valid feed instead of mixing live and fallback legs", () => {
    expect(buildTickerRates({ xlm: 0.25, usdc: Number.NaN })).toEqual(
      buildTickerRates(FALLBACK_TICKER_FIAT_RATES)
    );
    expect(buildTickerRates({ xlm: -1, usdc: 1 })).toEqual(
      buildTickerRates(FALLBACK_TICKER_FIAT_RATES)
    );
  });

  it("formats small, normal and large rates without losing the value", () => {
    expect(formatTickerRate(0.00012345)).toBe("0.0001");
    expect(formatTickerRate(0.12)).toBe("0.120");
    expect(formatTickerRate(1)).toBe("1.000");
    expect(formatTickerRate(1234.567)).toBe("1,234.57");
    expect(formatTickerRate(Number.NaN)).toBe("—");
    expect(formatTickerRate(-1)).toBe("—");
  });
});
