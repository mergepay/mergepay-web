import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurrencyBadge } from "./currency-badge";

describe("CurrencyBadge", () => {
  it("renders an XLM badge with the ink (native) tone", () => {
    render(<CurrencyBadge code="XLM" />);
    const badge = screen.getByText("XLM");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-ink");
    expect(badge.className).toContain("text-lime");
  });

  it("renders a USDC badge with the aqua (issued) tone", () => {
    render(<CurrencyBadge code="USDC" />);
    const badge = screen.getByText("USDC");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-aqua");
    expect(badge.className).toContain("text-ink");
  });

  it("normalises casing and whitespace", () => {
    render(<CurrencyBadge code=" usdc " />);
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("falls back to the paper tone for unknown codes", () => {
    render(<CurrencyBadge code="ETH" />);
    const badge = screen.getByText("ETH");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-paper");
  });

  it("renders a neutral placeholder when no code is provided", () => {
    render(<CurrencyBadge code={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("exposes an accessible label naming the asset", () => {
    render(<CurrencyBadge code="XLM" />);
    expect(screen.getByText("XLM asset")).toBeInTheDocument();
  });
});