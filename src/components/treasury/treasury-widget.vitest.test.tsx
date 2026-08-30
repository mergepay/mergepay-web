import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TreasuryWidget } from "./treasury-widget";

const { aggregateMock } = vi.hoisted(() => ({
  aggregateMock: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  useTreasuryAggregate: (...args: unknown[]) => aggregateMock(...args),
}));

const GROUPS = [
  { id: "g1", name: "Trip to Lagos", treasuryEnabled: true },
  { id: "g2", name: "Rent Circle", treasuryEnabled: false },
];

const FUNDED = {
  data: {
    assets: [
      { assetCode: "USDC", assetIssuer: "GA5Z", total: "75", fundedTreasuries: 2, totalTreasuries: 2 },
      { assetCode: "XLM", assetIssuer: null, total: "13", fundedTreasuries: 2, totalTreasuries: 2 },
    ],
    treasuryCount: 2,
    sources: [],
    allZero: false,
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

const EMPTY = {
  data: { assets: [], treasuryCount: 1, sources: [], allZero: true },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

describe("TreasuryWidget", () => {
  it("renders nothing when there are no enabled treasuries", () => {
    aggregateMock.mockReturnValue({ ...FUNDED });
    const { container } = render(
      <TreasuryWidget groups={[{ id: "g2", name: "Rent", treasuryEnabled: false }]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows an aggregate row per asset, formatted correctly", () => {
    aggregateMock.mockReturnValue(FUNDED);
    render(<TreasuryWidget groups={GROUPS} />);

    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText("XLM")).toBeInTheDocument();
    // Money renders the amount (aria-hidden) and an sr-only label node.
    expect(screen.getAllByText(/75\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/13\.00/).length).toBeGreaterThan(0);
    // Footer text is split across text nodes by JSX whitespace.
    expect(
      screen.getByText((_c, node) => node?.textContent === "Combined across 2 enabled groups.")
    ).toBeInTheDocument();
  });

  it("handles a zero-balance collective gracefully", () => {
    aggregateMock.mockReturnValue({ ...EMPTY, data: { ...EMPTY.data, treasuryCount: 1 } });
    render(<TreasuryWidget groups={[{ id: "g1", name: "Trip", treasuryEnabled: true }]} />);

    expect(
      screen.getByText(/no balances across your treasuries yet/i)
    ).toBeInTheDocument();
  });

  it("shows a retry action on error", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    aggregateMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const { rerender } = render(<TreasuryWidget groups={GROUPS} />);
    (await import("@testing-library/react")).fireEvent.click(
      screen.getByRole("button", { name: /retry/i })
    );
    expect(refetch).toHaveBeenCalled();
    rerender(<TreasuryWidget groups={GROUPS} />);
  });
});