import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiCurrencyBalanceSummary } from "./MultiCurrencyBalanceSummary";
import type { MemberBalance } from "@/lib/types";

// The cross rate is derived from the fiat pair the rates hook already
// resolves, so the only knob these tests need is that pair. 0.5 USD per XLM
// and 1 USD per USDC makes 1 XLM exactly half a USDC, which keeps every
// expected string readable.
const { mockRates } = vi.hoisted(() => ({ mockRates: { current: { xlm: 0.5, usdc: 1, live: true } } }));

vi.mock("@/hooks/useCurrencyRates", () => ({
  useCurrencyRates: () => ({
    rates: mockRates.current,
    isLive: mockRates.current.live,
    isFetching: false,
  }),
}));

vi.mock("@/lib/fiat-preference", () => ({
  useFiatPreference: (selector: (s: { preferredCurrency: string }) => unknown) =>
    selector({ preferredCurrency: "USD" }),
}));

function balance(userId: string, net: string, assetCode: string): MemberBalance {
  return {
    userId,
    user: {
      id: userId,
      stellarPublicKey: `key-${userId}`,
      displayName: userId,
      avatarUrl: null,
      createdAt: "2026-01-01",
    },
    net,
    assetCode,
  };
}

describe("MultiCurrencyBalanceSummary", () => {
  beforeEach(() => {
    mockRates.current = { xlm: 0.5, usdc: 1, live: true };
  });

  it("shows each asset's own value and code", () => {
    render(
      <MultiCurrencyBalanceSummary
        balances={[
          balance("user-1", "100.0000000", "XLM"),
          balance("user-1", "25.0000000", "USDC"),
        ]}
      />
    );

    expect(screen.getAllByText("100.00 XLM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25.00 USDC").length).toBeGreaterThan(0);
  });

  it("shows the cross-asset equivalent and one total when the group holds two assets", () => {
    render(
      <MultiCurrencyBalanceSummary
        balances={[
          balance("user-1", "100.0000000", "XLM"),
          balance("user-1", "25.0000000", "USDC"),
        ]}
      />
    );

    // USDC sorts first, so it is the base: only the XLM leg needs an
    // equivalent, and 100 XLM at half a USDC each is 50 USDC.
    expect(screen.getAllByText(/≈ 50\.00 USDC/).length).toBe(1);
    expect(screen.getByText("Total in USDC")).toBeDefined();
    expect(screen.getAllByText("75.00 USDC").length).toBeGreaterThan(0);
  });

  it("keeps the sign of an owed position in the equivalent and the total", () => {
    render(
      <MultiCurrencyBalanceSummary
        balances={[
          balance("user-1", "-100.0000000", "XLM"),
          balance("user-1", "25.0000000", "USDC"),
        ]}
      />
    );

    expect(screen.getAllByText(/≈ -50\.00 USDC/).length).toBe(1);
    expect(screen.getAllByText("-25.00 USDC").length).toBeGreaterThan(0);
  });

  it("shows no equivalents for a single-asset group", () => {
    render(<MultiCurrencyBalanceSummary balances={[balance("user-1", "10.0000000", "XLM")]} />);

    expect(screen.queryAllByText(/≈/).length).toBe(0);
    expect(screen.queryByText(/Total in/)).toBeNull();
    expect(screen.getAllByText("10.00 XLM").length).toBeGreaterThan(0);
  });

  it("still lists the balances when no usable rate is available", () => {
    mockRates.current = { xlm: 0, usdc: 0, live: false };
    render(
      <MultiCurrencyBalanceSummary
        balances={[
          balance("user-1", "100.0000000", "XLM"),
          balance("user-1", "25.0000000", "USDC"),
        ]}
      />
    );

    // A missing rate must cost the estimate, never the position itself.
    expect(screen.queryAllByText(/≈/).length).toBe(0);
    expect(screen.queryByText(/Total in/)).toBeNull();
    expect(screen.getAllByText("100.00 XLM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("25.00 USDC").length).toBeGreaterThan(0);
  });

  it("omits the total when one leg's asset has no rate", () => {
    render(
      <MultiCurrencyBalanceSummary
        balances={[
          balance("user-1", "100.0000000", "BTC"),
          balance("user-1", "25.0000000", "USDC"),
        ]}
      />
    );

    expect(screen.queryByText(/Total in/)).toBeNull();
    expect(screen.getAllByText("100.00 BTC").length).toBeGreaterThan(0);
  });
});
