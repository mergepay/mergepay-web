import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetSelector } from "./AssetSelector";

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

function renderSelector(props: Partial<Parameters<typeof AssetSelector>[0]> = {}) {
  return render(
    <AssetSelector
      value="XLM"
      onChange={vi.fn()}
      {...props}
    />
  );
}

describe("AssetSelector", () => {
  it("renders the amount input with a live fiat preview", () => {
    renderSelector({ cryptoAmount: "10" });

    // 10 XLM × 0.12 USD/XLM → $1.20
    expect(screen.getByTestId("asset-equivalent").textContent).toMatch(
      /1\.20 USD/
    );
  });

  it("shows a prompt when no amount is entered", () => {
    renderSelector({ cryptoAmount: undefined });

    expect(screen.getByTestId("asset-equivalent").textContent).toMatch(
      /enter an amount/i
    );
  });

  it("lists the configured settlement assets", () => {
    renderSelector();

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options).toContain("XLM");
  });

  it("notifies the parent when the selected asset changes", () => {
    const onChange = vi.fn();
    renderSelector({ onChange });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "USDC" } });
    expect(onChange).toHaveBeenCalledWith("USDC");
  });

  it("forwards blur events to the parent", () => {
    const onBlur = vi.fn();
    renderSelector({ onBlur });

    fireEvent.blur(screen.getByRole("combobox"));
    expect(onBlur).toHaveBeenCalled();
  });
});
