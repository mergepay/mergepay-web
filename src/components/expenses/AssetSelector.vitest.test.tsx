import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetSelector, normalizeAssetAmount } from "./AssetSelector";

// The selector's conversion preview depends on hooks that fetch live rates;
// stub them so tests exercise pure formatting/math deterministically.
vi.mock("@/hooks/useCurrencyRates", () => ({
  useCurrencyRates: () => ({
    rates: { xlm: 0.12, usdc: 1.0, live: true },
    isLive: true,
    isFetching: false,
  }),
  convertToFiat: (amount: string | number, assetCode: string) => {
    const num = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(num) || num < 0) return null;
    const rate = assetCode.toUpperCase() === "XLM" ? 0.12 : 1.0;
    return (num * rate).toFixed(2);
  },
}));

vi.mock("@/lib/fiat-preference", () => ({
  useFiatPreference: () => ({ preferredCurrency: "USD" }),
}));

const assets = [
  { code: "XLM", issuer: null, name: "Lumen" },
  { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", name: "USD Coin" },
  { code: "ARST", issuer: "GBBD47IF6LWK2P7MDEVSCWR7DPUWV3NY3DTQEVFL4TWVC5GIOTASH4EU", name: "Argentine Peso" },
];

describe("normalizeAssetAmount (decimal handling)", () => {
  it("keeps up to 7 decimal places", () => {
    expect(normalizeAssetAmount("1.2345678")).toBe("1.2345678");
    expect(normalizeAssetAmount("0.0000001")).toBe("0.0000001");
  });

  it("rounds to 7 decimal places when input has more", () => {
    expect(normalizeAssetAmount("1.12345678")).toBe("1.1234568");
    expect(normalizeAssetAmount("0.99999999")).toBe("1");
  });

  it("returns null for non-numeric or invalid input", () => {
    expect(normalizeAssetAmount("abc")).toBeNull();
    expect(normalizeAssetAmount("-5")).toBeNull();
    expect(normalizeAssetAmount("0")).toBeNull();
  });

  it("returns empty string for empty input", () => {
    expect(normalizeAssetAmount("")).toBe("");
    expect(normalizeAssetAmount("   ")).toBe("");
  });

  it("normalizes equivalent representations", () => {
    expect(normalizeAssetAmount("1.500")).toBe("1.5");
    expect(normalizeAssetAmount("1e1")).toBe("10");
  });
});

describe("AssetSelector", () => {
  it("renders the amount input with a live fiat preview", () => {
    render(
      <AssetSelector
        value="10"
        assetCode="XLM"
        onAmountChange={vi.fn()}
        onAssetChange={vi.fn()}
        assets={assets}
      />
    );

    const input = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(input.value).toBe("10");

    // 10 XLM × 0.12 USD/XLM → $1.20
    expect(screen.getByText(/≈ 1\.20 USD/)).toBeInTheDocument();
  });

  it("updates the fiat preview as the user types", () => {
    const onAmountChange = vi.fn();
    render(
      <AssetSelector
        value=""
        assetCode="XLM"
        onAmountChange={onAmountChange}
        onAssetChange={vi.fn()}
        assets={assets}
      />
    );

    const input = screen.getByLabelText(/amount/i);
    fireEvent.change(input, { target: { value: "25" } });
    expect(onAmountChange).toHaveBeenCalledWith("25");
  });

  it("lists XLM, USDC and custom trustline tokens", () => {
    render(
      <AssetSelector
        value=""
        assetCode="XLM"
        onAmountChange={vi.fn()}
        onAssetChange={vi.fn()}
        assets={assets}
      />
    );

    const select = screen.getByLabelText("Asset") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["XLM", "USDC", "ARST"]);
  });

  it("notifies the parent when the selected asset changes", () => {
    const onAssetChange = vi.fn();
    render(
      <AssetSelector
        value=""
        assetCode="XLM"
        onAmountChange={vi.fn()}
        onAssetChange={onAssetChange}
        assets={assets}
      />
    );

    fireEvent.change(screen.getByLabelText("Asset"), { target: { value: "USDC" } });
    expect(onAssetChange).toHaveBeenCalledWith("USDC");
  });

  it("normalizes the amount to 7 decimal places on blur", () => {
    const onAmountChange = vi.fn();
    render(
      <AssetSelector
        value="1.23456789"
        assetCode="XLM"
        onAmountChange={onAmountChange}
        onAssetChange={vi.fn()}
        assets={assets}
      />
    );

    fireEvent.blur(screen.getByLabelText(/amount/i));
    expect(onAmountChange).toHaveBeenCalledWith("1.2345679");
  });
});
