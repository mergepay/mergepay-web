import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TreasuryBalanceWidget } from "./TreasuryBalanceWidget";

const {
  balancesMock,
  ratesMock,
  fiatMock,
  walletStatusMock,
  trustlineModalMock,
} = vi.hoisted(() => ({
  balancesMock: vi.fn(),
  ratesMock: vi.fn(),
  fiatMock: vi.fn(),
  walletStatusMock: vi.fn(),
  trustlineModalMock: vi.fn(),
}));

vi.mock("@/hooks/useWalletAssetBalances", () => ({
  useWalletAssetBalances: (...args: unknown[]) => balancesMock(...args),
}));

vi.mock("@/hooks/useCurrencyRates", () => ({
  useCurrencyRates: (...args: unknown[]) => ratesMock(...args),
}));

vi.mock("@/lib/fiat-preference", () => ({
  useFiatPreference: (
    selector: (s: { preferredCurrency: string }) => unknown
  ) => selector({ preferredCurrency: "USD" }),
}));

vi.mock("@/hooks/useWalletStatus", () => ({
  useWalletStatus: (...args: unknown[]) => walletStatusMock(...args),
}));

vi.mock("@/components/wallet/wallet-status", () => ({
  WalletPrerequisiteNotice: ({ status }: { status: { message: string } }) => (
    <div data-testid="wallet-notice">{status.message}</div>
  ),
}));

vi.mock("@/components/wallet/TrustlineModal", () => ({
  TrustlineModal: (props: { open: boolean; assets: { code: string }[] }) =>
    props.open ? (
      <div data-testid="trustline-modal">
        {props.assets.map((a) => (
          <span key={a.code}>{a.code}</span>
        ))}
      </div>
    ) : null,
}));

/** A connected wallet on the right network — flat shape, as the hook returns. */
const CONNECTED = {
  kind: "connected" as const,
  canSign: true,
  address: "GWALLET",
  label: "Connected",
  message: "Connected",
  actionLabel: null,
  actionKind: null,
  tone: "lime" as const,
  networkName: null,
  refresh: vi.fn(),
};

const FUNDED = {
  assets: [
    {
      code: "XLM",
      issuer: null,
      name: "Lumen",
      balance: "120.5000000",
      hasTrustline: true,
    },
    {
      code: "USDC",
      issuer: "GISSUER",
      name: "USDC",
      balance: "75.0000000",
      hasTrustline: true,
    },
  ],
  isLoading: false,
  isError: false,
  refetch: vi.fn().mockResolvedValue(undefined),
};

function stubHappyPath() {
  walletStatusMock.mockReturnValue(CONNECTED);
  balancesMock.mockReturnValue(FUNDED);
  ratesMock.mockReturnValue({
    rates: { xlm: 0.5, usdc: 1 },
    isLive: true,
    isFetching: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TreasuryBalanceWidget (#344)", () => {
  it("renders a balance card per configured asset", () => {
    stubHappyPath();
    render(<TreasuryBalanceWidget />);

    expect(screen.getByTestId("treasury-asset-XLM")).toBeInTheDocument();
    expect(screen.getByTestId("treasury-asset-USDC")).toBeInTheDocument();
    // Amounts render through the shared Money layer (visible text + sr-only).
    expect(screen.getAllByText(/120\.50/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/75\.00/).length).toBeGreaterThan(0);
  });

  it("shows conversion rates: fiat price and the cross rate", () => {
    stubHappyPath();
    render(<TreasuryBalanceWidget />);

    // The fiat line and the cross line both start "1 XLM ≈", so match the
    // whole line with whitespace normalised across JSX text nodes: $0.50
    // direct, and a 0.5/1 = 0.5 USDC cross rate.
    const normalise = (node: Element | null) => node?.textContent?.replace(/\s+/g, " ").trim();
    expect(screen.getByText((_, node) => normalise(node) === "1 XLM ≈ $0.50")).toBeInTheDocument();
    expect(screen.getByText((_, node) => normalise(node) === "1 XLM ≈ 0.5000 USDC"))
      .toBeInTheDocument();
    // And the inverse for USDC: 1/0.5 = 2 XLM.
    expect(screen.getByText((_, node) => normalise(node) === "1 USDC ≈ 2.0000 XLM"))
      .toBeInTheDocument();
  });

  it("marks a trusted asset and hides the trustline CTA", () => {
    stubHappyPath();
    render(<TreasuryBalanceWidget />);

    expect(screen.getAllByText(/trusted/i).length).toBe(2);
    expect(screen.queryByTestId("trustline-cta-XLM")).not.toBeInTheDocument();
    expect(screen.queryByTestId("trustline-cta-USDC")).not.toBeInTheDocument();
  });

  it("warns clearly when the USDC trustline is missing and offers enablement", async () => {
    stubHappyPath();
    balancesMock.mockReturnValue({
      ...FUNDED,
      assets: [
        FUNDED.assets[0],
        { ...FUNDED.assets[1], hasTrustline: false, balance: "0" },
      ],
    });
    render(<TreasuryBalanceWidget />);

    expect(screen.getByTestId("trustline-cta-USDC")).toBeInTheDocument();
    expect(screen.getByText(/no trustline/i)).toBeInTheDocument();
    expect(
      screen.getByText(/USDC needs a trustline before this account can receive it/i)
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("trustline-cta-USDC"));
    });
    expect(screen.getByTestId("trustline-modal")).toBeInTheDocument();
  });

  it("opens the trustline modal through Freighter and refetches when ready", async () => {
    stubHappyPath();
    balancesMock.mockReturnValue({
      ...FUNDED,
      assets: [{ ...FUNDED.assets[1], hasTrustline: false, balance: "0" }],
    });
    render(<TreasuryBalanceWidget />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("trustline-cta-USDC"));
    });
    expect(screen.getByTestId("trustline-modal")).toBeInTheDocument();
  });

  it("shows the wallet connect prompt when no wallet is connected", () => {
    stubHappyPath();
    walletStatusMock.mockReturnValue({
      ...CONNECTED,
      kind: "disconnected" as const,
      canSign: false,
      address: null,
      message: "Freighter is installed but has not shared an account.",
    });
    balancesMock.mockReturnValue({ ...FUNDED, assets: undefined });

    render(<TreasuryBalanceWidget />);
    expect(screen.getByTestId("wallet-notice")).toHaveTextContent(
      /has not shared an account/i
    );
    expect(
      screen.getByText(/connect your freighter wallet/i)
    ).toBeInTheDocument();
  });

  it("renders a loading state while balances are fetched", () => {
    stubHappyPath();
    balancesMock.mockReturnValue({
      assets: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<TreasuryBalanceWidget />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /loading wallet balances/i
    );
  });

  it("renders an error state with retry when the fetch fails", async () => {
    stubHappyPath();
    const refetch = vi.fn().mockResolvedValue(undefined);
    balancesMock.mockReturnValue({
      assets: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<TreasuryBalanceWidget />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/could not load balances/i);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    });
    expect(refetch).toHaveBeenCalled();
  });

  it("refetches on demand from the header refresh control", async () => {
    stubHappyPath();
    render(<TreasuryBalanceWidget />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /refresh wallet balances/i })
      );
    });
    expect(FUNDED.refetch).toHaveBeenCalled();
  });

  it("hides conversion figures when the fiat feed has no answer", () => {
    stubHappyPath();
    ratesMock.mockReturnValue({
      rates: { xlm: 0, usdc: 0 },
      isLive: false,
      isFetching: false,
    });
    render(<TreasuryBalanceWidget />);

    expect(screen.queryByText(/1 XLM ≈/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 USDC ≈/)).not.toBeInTheDocument();
  });
});
