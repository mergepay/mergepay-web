import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetSelector } from "./AssetSelector";

// The selector's conversion preview depends on a hook that fetches live
// rates; stub it so tests exercise pure formatting deterministically.
vi.mock("@/hooks/useCurrencyRates", () => ({
  useCurrencyRates: () => ({
    rates: { xlm: 0.12, usdc: 1.0 },
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

describe("AssetSelector", () => {
  it("lists the configured settlement assets", () => {
    render(<AssetSelector value="XLM" onChange={vi.fn()} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(expect.arrayContaining(["XLM", "USDC"]));
  });

  it("renders a live fiat preview for the selected asset", () => {
    render(<AssetSelector value="XLM" onChange={vi.fn()} cryptoAmount="10" />);

    // 10 XLM x 0.12 USD/XLM -> $1.20
    expect(screen.getByTestId("asset-equivalent")).toHaveTextContent(
      "≈ 1.20 USD"
    );
  });

  it("prompts for an amount when none is provided", () => {
    render(<AssetSelector value="XLM" onChange={vi.fn()} />);

    expect(screen.getByTestId("asset-equivalent")).toHaveTextContent(
      /enter an amount/i
    );
  });

  it("notifies the parent when the selected asset changes", () => {
    const onChange = vi.fn();
    render(<AssetSelector value="XLM" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "USDC" },
    });
    expect(onChange).toHaveBeenCalledWith("USDC");
  });
});
