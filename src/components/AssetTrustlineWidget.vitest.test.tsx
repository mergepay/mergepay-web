import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssetTrustlineWidget } from "./AssetTrustlineWidget";
import * as trustlineLib from "@/lib/trustline";
import * as stellarLib from "@/lib/stellar";
import { toast } from "sonner";

vi.mock("@/lib/trustline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trustline")>("@/lib/trustline");
  return {
    ...actual,
    fetchHorizonAccountBalances: vi.fn(),
  };
});

vi.mock("@/lib/stellar", () => ({
  addTrustline: vi.fn(),
  WalletError: class WalletError extends Error {},
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("AssetTrustlineWidget Component (Issue #219)", () => {
  const testPublicKey = "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3IF5WDMWGMED";
  const customAssets = [
    { code: "XLM", issuer: null, name: "Stellar Lumens" },
    { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", name: "USD Coin" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders disconnected view when no public key is present", () => {
    renderWithClient(<AssetTrustlineWidget publicKey="" />);

    expect(screen.getByTestId("asset-trustline-widget-disconnected")).toBeInTheDocument();
    expect(screen.getByText("Wallet Disconnected")).toBeInTheDocument();
  });

  it("fetches balances and renders trustline status for XLM and USDC", async () => {
    vi.mocked(trustlineLib.fetchHorizonAccountBalances).mockResolvedValueOnce([
      { asset_type: "native", balance: "100.5000000" },
      {
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        balance: "50.0000000",
      },
    ]);

    renderWithClient(
      <AssetTrustlineWidget
        publicKey={testPublicKey}
        requiredAssets={customAssets}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("trustline-active-XLM")).toBeInTheDocument();
      expect(screen.getByTestId("trustline-active-USDC")).toBeInTheDocument();
    });

    expect(screen.getByText("100.5000000 XLM")).toBeInTheDocument();
    expect(screen.getByText("50.0000000 USDC")).toBeInTheDocument();
  });

  it("displays missing trustline warning banner with action button when USDC is missing", async () => {
    vi.mocked(trustlineLib.fetchHorizonAccountBalances).mockResolvedValueOnce([
      { asset_type: "native", balance: "25.0000000" },
      // No USDC balance
    ]);

    renderWithClient(
      <AssetTrustlineWidget
        publicKey={testPublicKey}
        requiredAssets={customAssets}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("missing-trustline-warning")).toBeInTheDocument();
      expect(screen.getByTestId("add-trustline-USDC-btn")).toBeInTheDocument();
    });

    expect(screen.getByTestId("missing-trustline-warning")).toHaveTextContent("Your wallet cannot receive USDC");
  });

  it("triggers addTrustline and displays toast on action prompt click", async () => {
    vi.mocked(trustlineLib.fetchHorizonAccountBalances).mockResolvedValue([
      { asset_type: "native", balance: "15.0000000" },
    ]);
    vi.mocked(stellarLib.addTrustline).mockResolvedValueOnce({
      txHash: "abcdef1234567890abcdef1234567890",
    });

    const onTrustlineAdded = vi.fn();

    renderWithClient(
      <AssetTrustlineWidget
        publicKey={testPublicKey}
        requiredAssets={customAssets}
        onTrustlineAdded={onTrustlineAdded}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("add-trustline-USDC-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("add-trustline-USDC-btn"));

    await waitFor(() => {
      expect(stellarLib.addTrustline).toHaveBeenCalledWith(
        testPublicKey,
        "USDC",
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
      );
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Trustline for USDC established"));
      expect(onTrustlineAdded).toHaveBeenCalledWith("USDC");
    });
  });

  it("displays low balance warning when XLM or asset is below threshold", async () => {
    vi.mocked(trustlineLib.fetchHorizonAccountBalances).mockResolvedValueOnce([
      { asset_type: "native", balance: "0.2000000" }, // < 1.0 XLM minimum
      {
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        balance: "10.0000000",
      },
    ]);

    renderWithClient(
      <AssetTrustlineWidget
        publicKey={testPublicKey}
        requiredAssets={customAssets}
        minimumBalances={{ XLM: "1.0", USDC: "0.0" }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("low-balance-warning")).toBeInTheDocument();
    });

    expect(screen.getByTestId("low-balance-warning")).toHaveTextContent("Low balance detected for XLM");
  });
});
