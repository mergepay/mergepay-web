import { describe, expect, it } from "vitest";
import { formatBalanceWithFiat } from "./currencyConversion";

describe("Currency conversion and balance display utilities (#610)", () => {
  it("formats XLM and USDC balances with fiat equivalents and accessible labels", () => {
    const xlmDisplay = formatBalanceWithFiat("50", "XLM", {
      fiatCurrency: "USD",
      rates: { XLM: 0.12 },
    });
    expect(xlmDisplay.tokenText).toContain("XLM");
    expect(xlmDisplay.hasFiat).toBe(true);
    expect(xlmDisplay.fiatText).toContain("6.00");

    const loadingDisplay = formatBalanceWithFiat("25", "USDC", {
      isLoading: true,
    });
    expect(loadingDisplay.isLoading).toBe(true);
  });
});
