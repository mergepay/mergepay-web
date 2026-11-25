import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrustlineManager } from "./TrustlineManager";
import * as stellar from "@/lib/stellar";

vi.mock("@/lib/stellar");
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "usr-1", stellarPublicKey: "GAALOCK1234567890", displayName: "Alice" },
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("TrustlineManager Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(stellar, "getWalletAssets").mockResolvedValue([
      {
        code: "XLM",
        issuer: null,
        name: "Lumen",
        balance: "100.0000000",
        hasTrustline: true,
      },
      {
        code: "USDC",
        issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        name: "USD Coin",
        balance: "0.0000000",
        hasTrustline: false,
      },
    ]);
  });

  it("renders trustlines and displays missing USDC trustline warning", async () => {
    renderWithClient(<TrustlineManager />);

    expect(await screen.findByText("Trustline Management")).toBeInTheDocument();
    expect(await screen.findByText("USD Coin")).toBeInTheDocument();
    expect(screen.getByText("Lumen")).toBeInTheDocument();
    expect(screen.getByText("Active Trustline")).toBeInTheDocument();
    expect(screen.getByText("Activation Required")).toBeInTheDocument();
    expect(screen.getByTestId("enable-trustline-btn-USDC")).toBeInTheDocument();
  });

  it("calls addTrustline when Enable Trustline button is clicked", async () => {
    const addSpy = vi.spyOn(stellar, "addTrustline").mockResolvedValue({ txHash: "abc12345678" });

    renderWithClient(<TrustlineManager />);
    const btn = await screen.findByTestId("enable-trustline-btn-USDC");
    fireEvent.click(btn);

    expect(addSpy).toHaveBeenCalledWith(
      "GAALOCK1234567890",
      "USDC",
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    );
  });
});
