import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TreasuryOverview } from "./TreasuryOverview";

const { infoMock, ratesMock, fiatMock } = vi.hoisted(() => ({
  infoMock: vi.fn(),
  ratesMock: vi.fn(),
  fiatMock: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  useTreasuryInfo: (...args: unknown[]) => infoMock(...args),
}));

vi.mock("@/hooks/useCurrencyRates", () => ({
  useCurrencyRates: (...args: unknown[]) => ratesMock(...args),
  convertToFiat: (...args: unknown[]) => fiatMock(...args),
}));

const FUNDED = {
  data: {
    publicKey: "GTREASURY",
    balances: [
      { assetCode: "XLM", assetIssuer: null, balance: "100" },
      { assetCode: "USDC", assetIssuer: "GISSUER", balance: "50" },
    ],
    signers: [],
    thresholds: { low: 1, med: 1, high: 1 },
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn().mockResolvedValue(undefined),
};

const EMPTY = {
  data: {
    publicKey: "GTREASURY",
    balances: [
      { assetCode: "XLM", assetIssuer: null, balance: "0" },
      { assetCode: "USDC", assetIssuer: "GISSUER", balance: "0" },
    ],
    signers: [],
    thresholds: { low: 1, med: 1, high: 1 },
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn().mockResolvedValue(undefined),
};

function stubQuery(result: Record<string, unknown>) {
  infoMock.mockReturnValue(result);
  ratesMock.mockReturnValue({
    rates: { xlm: 0.5, usdc: 1, live: true },
    isLive: true,
    isFetching: false,
  });
  // 100 XLM @ 0.5 = 50 ; 50 USDC @ 1 = 50 → an even 50/50 split.
  fiatMock.mockImplementation((amount: string | number, assetCode: string) => {
    const value = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(value)) return null;
    const rate = assetCode === "USDC" ? 1 : assetCode === "XLM" ? 0.5 : null;
    return rate === null ? null : (value * rate).toFixed(2);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TreasuryOverview (#367)", () => {
  it("asks React Query for this group's treasury", () => {
    stubQuery({ ...FUNDED });
    render(<TreasuryOverview groupId="grp-1" />);
    expect(infoMock).toHaveBeenCalledWith("grp-1", true);
  });

  it("renders a loading state while the treasury is fetched", () => {
    stubQuery({ ...FUNDED, data: undefined, isLoading: true });
    render(<TreasuryOverview groupId="grp-1" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /loading treasury balances/i
    );
  });

  it("shows a fallback banner with retry when the fetch fails", () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    stubQuery({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<TreasuryOverview groupId="grp-1" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/could not load the treasury/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the empty state for zero balances", () => {
    stubQuery(EMPTY);
    render(<TreasuryOverview groupId="grp-1" />);

    expect(screen.getByText(/no balances in the treasury yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // Both expected assets lack an established trustline.
    expect(screen.getByText(/trustlines not established/i)).toBeInTheDocument();
    expect(screen.getByText(/XLM, USDC must be trusted/i)).toBeInTheDocument();
  });

  it("renders one distribution row per asset with its share", () => {
    stubQuery(FUNDED);
    render(<TreasuryOverview groupId="grp-1" />);

    expect(screen.getByText("XLM")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();

    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("aria-valuenow", "50");
    expect(bars[1]).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/by USD value/i)).toBeInTheDocument();
  });

  it("flags an asset the treasury cannot hold yet", () => {
    stubQuery({
      ...FUNDED,
      data: {
        ...FUNDED.data,
        balances: [{ assetCode: "XLM", assetIssuer: null, balance: "42" }],
      },
    });
    render(<TreasuryOverview groupId="grp-1" />);

    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText(/no trustline/i)).toBeInTheDocument();
    expect(screen.getByText(/not held by this treasury yet/i)).toBeInTheDocument();
  });

  it("refetches on demand from the header control", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    stubQuery({ ...FUNDED, refetch });
    render(<TreasuryOverview groupId="grp-1" />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /refresh treasury balances/i })
      );
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
