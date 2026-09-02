import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { TrustlineVerificationBanner } from "./TrustlineVerificationBanner";
import type { ConfiguredAsset } from "@/lib/trustline";

vi.mock("@/lib/trustline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/trustline")>("@/lib/trustline");
  return {
    ...actual,
    fetchHorizonAccountBalances: vi.fn(),
  };
});

vi.mock("@/lib/stellar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar")>("@/lib/stellar");
  return {
    ...actual,
    addTrustline: vi.fn(),
  };
});

const { fetchHorizonAccountBalances } = vi.mocked(
  await import("@/lib/trustline")
);
const { addTrustline } = vi.mocked(await import("@/lib/stellar"));

const issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const requiredAssets: ConfiguredAsset[] = [
  { code: "XLM", issuer: null },
  { code: "USDC", issuer },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "QueryClientWrapper";
  return Wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchHorizonAccountBalances.mockResolvedValue([
    { asset_type: "native", balance: "100.0000000" },
  ]);
});

describe("TrustlineVerificationBanner", () => {
  it("renders nothing when every required trustline is present", async () => {
    fetchHorizonAccountBalances.mockResolvedValue([
      { asset_type: "native", balance: "100.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: issuer, balance: "5.0000000" },
    ]);

    const { container } = render(
      <TrustlineVerificationBanner publicKey="GABC123" assets={requiredAssets} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(fetchHorizonAccountBalances).toHaveBeenCalled();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("renders an alert banner listing missing trustline assets", async () => {
    render(
      <TrustlineVerificationBanner publicKey="GABC123" assets={requiredAssets} />,
      { wrapper: createWrapper() }
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Trustline Required");
    expect(alert).toHaveTextContent("USDC");
    // XLM is native — never listed as missing
    expect(alert).not.toHaveTextContent("XLM");
  });

  it("establishes the missing trustline via Freighter and refetches balances", async () => {
    addTrustline.mockResolvedValue({ txHash: "abcdef0123" });

    render(
      <TrustlineVerificationBanner publicKey="GABC123" assets={requiredAssets} />,
      { wrapper: createWrapper() }
    );

    const addButton = await screen.findByRole("button", { name: /add/i });
    addButton.click();

    await waitFor(() => {
      expect(addTrustline).toHaveBeenCalledWith("GABC123", "USDC", issuer);
    });
    expect(fetchHorizonAccountBalances).toHaveBeenCalledTimes(2);
  });
});
