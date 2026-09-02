import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AnchorModal } from "./AnchorModal";
import type { AnchorInfo, AnchorSession } from "@/lib/types";

const usdcIssuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const anchors: AnchorInfo[] = [
  {
    name: "TestAnchor",
    homeDomain: "testanchor.example.com",
    assets: [{ code: "USDC", issuer: usdcIssuer }],
  },
  {
    name: "FiatOnRamp",
    homeDomain: "fiatonramp.example.com",
    assets: [{ code: "EURC", issuer: "GBEUR...ISSUER" }],
  },
];

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listAnchors: vi.fn(),
      anchorDeposit: vi.fn(),
      anchorWithdraw: vi.fn(),
    },
  };
});

const { api } = vi.mocked(await import("@/lib/api"));

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
});

describe("AnchorModal", () => {
  it("shows the loading state while the anchor catalogue is fetched", () => {
    api.listAnchors.mockImplementation(
      () => new Promise(() => undefined)
    );
    render(
      <AnchorModal open assetCode="USDC" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/loading anchor options/i)).toBeInTheDocument();
  });

  it("shows an error state with retry when the anchor request fails", async () => {
    api.listAnchors.mockRejectedValue(new Error("network down"));
    render(
      <AnchorModal open assetCode="USDC" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load anchor information/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows an empty state when no anchor supports the asset", async () => {
    api.listAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorModal open assetCode="ARST" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no anchors currently support/i);
  });

  it("lists only anchors supporting the requested asset", async () => {
    api.listAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorModal open assetCode="USDC" kind="withdrawal" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    expect(await screen.findByText("TestAnchor")).toBeInTheDocument();
    expect(screen.queryByText("FiatOnRamp")).not.toBeInTheDocument();
  });

  it("starts a deposit session and notifies the caller", async () => {
    api.listAnchors.mockResolvedValue({ anchors });
    const session: AnchorSession = {
      id: "session-1",
      userId: "user-1",
      anchorName: "TestAnchor",
      kind: "deposit",
      assetCode: "USDC",
      interactiveUrl: "https://anchor.example.com/flow",
      externalTransactionId: null,
      status: "incomplete",
      createdAt: "2026-08-29T10:00:00Z",
    };
    api.anchorDeposit.mockResolvedValue({
      session,
      challenge: { transaction: "AAAA...", networkPassphrase: "Test SDF Network" },
    });
    const onSessionStarted = vi.fn();

    render(
      <AnchorModal
        open
        assetCode="USDC"
        kind="deposit"
        onClose={() => {}}
        onSessionStarted={onSessionStarted}
      />,
      { wrapper: createWrapper() }
    );

    await screen.findByText("TestAnchor");
    screen.getByRole("button", { name: /start deposit/i }).click();

    await waitFor(() => {
      expect(api.anchorDeposit).toHaveBeenCalledWith({
        assetCode: "USDC",
        anchorName: "TestAnchor",
      });
    });
    await waitFor(() => {
      expect(onSessionStarted).toHaveBeenCalledWith(session);
    });
  });

  it("disables the start button until an anchor is chosen", async () => {
    api.listAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorModal open assetCode="ARST" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /start deposit/i })).toBeDisabled();
  });
});
