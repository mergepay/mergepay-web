import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TreasuryView } from "./TreasuryView";
import type { TreasuryTransaction } from "@/lib/types";

const { infoMock, historyMock, ratesMock, fiatMock } = vi.hoisted(() => ({
  infoMock: vi.fn(),
  historyMock: vi.fn(),
  ratesMock: vi.fn(),
  fiatMock: vi.fn(),
}));

vi.mock("@/lib/queries", () => ({
  useTreasuryInfo: (...args: unknown[]) => infoMock(...args),
  useTreasuryHistory: (...args: unknown[]) => historyMock(...args),
}));

vi.mock("@/hooks/useCurrencyRates", () => ({
  useCurrencyRates: (...args: unknown[]) => ratesMock(...args),
  convertToFiat: (...args: unknown[]) => fiatMock(...args),
}));

function transaction(
  overrides: Partial<TreasuryTransaction> = {}
): TreasuryTransaction {
  return {
    id: "tx-1",
    groupId: "grp-1",
    userId: "u1",
    user: {
      id: "u1",
      stellarPublicKey: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      displayName: "Ada",
      avatarUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    direction: "deposit",
    amount: "10",
    assetCode: "XLM",
    assetIssuer: null,
    destination: null,
    stellarTxHash: null,
    status: "confirmed",
    memo: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

const FUNDED_INFO = {
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

const HISTORY = {
  data: { transactions: [transaction()] },
  isLoading: false,
  isError: false,
  refetch: vi.fn().mockResolvedValue(undefined),
};

function stub(
  info: Record<string, unknown> = FUNDED_INFO,
  history: Record<string, unknown> = HISTORY
) {
  infoMock.mockReturnValue(info);
  historyMock.mockReturnValue(history);
  ratesMock.mockReturnValue({
    rates: { xlm: 0.5, usdc: 1, live: true },
    isLive: true,
    isFetching: false,
  });
  // 100 XLM @ 0.5 = 50 ; 50 USDC @ 1 = 50 → an even split.
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

describe("TreasuryView (#376)", () => {
  it("renders a not-enabled state without fetching", () => {
    stub();
    render(<TreasuryView groupId="grp-1" treasuryEnabled={false} />);
    expect(screen.getByText(/treasury mode is off/i)).toBeInTheDocument();
    // The queries are requested in a disabled state, so no network call runs.
    expect(infoMock).toHaveBeenCalledWith("grp-1", false);
    expect(historyMock).toHaveBeenCalledWith("grp-1", false);
  });

  it("fetches both info and history when enabled", () => {
    stub();
    render(<TreasuryView groupId="grp-1" />);
    expect(infoMock).toHaveBeenCalledWith("grp-1", true);
    expect(historyMock).toHaveBeenCalledWith("grp-1", true);
  });

  it("renders a loading placeholder while balances are fetched", () => {
    stub({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(<TreasuryView groupId="grp-1" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /loading treasury balances/i
    );
  });

  it("shows a retryable error banner when the fetch fails", () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    stub({ data: undefined, isLoading: false, isError: true, refetch });
    render(<TreasuryView groupId="grp-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not load the treasury/i
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows a trustline readiness badge per settlement asset", () => {
    stub();
    render(<TreasuryView groupId="grp-1" />);
    expect(screen.getByText(/XLM ready/i)).toBeInTheDocument();
    expect(screen.getByText(/USDC ready/i)).toBeInTheDocument();
  });

  it("flags an asset with no trustline and names the requirement", () => {
    stub({
      ...FUNDED_INFO,
      data: {
        ...FUNDED_INFO.data,
        balances: [{ assetCode: "XLM", assetIssuer: null, balance: "42" }],
      },
    });
    render(<TreasuryView groupId="grp-1" />);

    expect(screen.getByText(/USDC missing/i)).toBeInTheDocument();
    expect(screen.getByText(/no trustline/i)).toBeInTheDocument();
    expect(screen.getByText(/not held by this treasury yet/i)).toBeInTheDocument();
  });

  it("renders a distribution row per asset with its share", () => {
    stub();
    render(<TreasuryView groupId="grp-1" />);

    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("aria-valuenow", "50");
    expect(bars[1]).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/by USD value/i)).toBeInTheDocument();
  });

  it("renders an idle state for a zero-balance treasury", () => {
    stub({
      ...FUNDED_INFO,
      data: {
        ...FUNDED_INFO.data,
        balances: [
          { assetCode: "XLM", assetIssuer: null, balance: "0" },
          { assetCode: "USDC", assetIssuer: "GISSUER", balance: "0" },
        ],
      },
    });
    render(<TreasuryView groupId="grp-1" />);

    expect(
      screen.getByText(/no balances in the treasury yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("aggregates confirmed member contributions from history", () => {
    stub(FUNDED_INFO, {
      ...HISTORY,
      data: {
        transactions: [
          transaction({ id: "a", amount: "10" }),
          transaction({ id: "b", amount: "4", direction: "withdrawal" }),
          // Pending movements must not count.
          transaction({ id: "c", amount: "999", status: "pending" }),
        ],
      },
    });
    render(<TreasuryView groupId="grp-1" />);

    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText(/in 10 · out 4/i)).toBeInTheDocument();
    expect(screen.getByText(/2 tx/i)).toBeInTheDocument();
    expect(screen.getAllByText("+6.00 XLM").length).toBeGreaterThan(0);
  });

  it("refetches info and history from the header control", async () => {
    const infoRefetch = vi.fn().mockResolvedValue(undefined);
    const historyRefetch = vi.fn().mockResolvedValue(undefined);
    stub({ ...FUNDED_INFO, refetch: infoRefetch }, { ...HISTORY, refetch: historyRefetch });
    render(<TreasuryView groupId="grp-1" />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /refresh treasury balances/i })
      );
    });
    expect(infoRefetch).toHaveBeenCalledTimes(1);
    expect(historyRefetch).toHaveBeenCalledTimes(1);
  });
});
