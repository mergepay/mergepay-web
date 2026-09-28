import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { AnchorDepositWithdrawModal } from "./AnchorDepositWithdrawModal";
import type { AnchorSession } from "@/lib/types";

const usdcIssuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4ZVN";

const anchors = [
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
      getAnchorSession: vi.fn(),
    },
  };
});

const { api } = vi.mocked(await import("@/lib/api"), { deep: true });

const mockedListAnchors = vi.mocked(api.listAnchors);
const mockedAnchorDeposit = vi.mocked(api.anchorDeposit);
const mockedAnchorWithdraw = vi.mocked(api.anchorWithdraw);
const mockedGetAnchorSession = vi.mocked(api.getAnchorSession);

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

describe("AnchorDepositWithdrawModal", () => {
  it("renders with asset selection dropdown showing XLM and USDC", () => {
    mockedListAnchors.mockImplementation(() => new Promise(() => undefined));
    render(
      <AnchorDepositWithdrawModal open assetCode="USDC" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText("XLM")).toBeInTheDocument();
    expect(screen.getAllByText("USDC")).toHaveLength(2);
  });

  it("shows loading state while anchor catalogue is fetched", () => {
    mockedListAnchors.mockImplementation(() => new Promise(() => undefined));
    render(
      <AnchorDepositWithdrawModal open assetCode="USDC" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/loading anchor options/i)).toBeInTheDocument();
  });

  it("shows error state with retry when the anchor request fails", async () => {
    mockedListAnchors.mockRejectedValue(new Error("network down"));
    render(
      <AnchorDepositWithdrawModal open assetCode="USDC" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load anchor information/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows empty state when no anchor supports the asset", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorDepositWithdrawModal open assetCode="ARST" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no anchors currently support/i);
  });

  it("lists only anchors supporting the requested asset", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorDepositWithdrawModal open assetCode="USDC" kind="withdrawal" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    expect(await screen.findByText("TestAnchor")).toBeInTheDocument();
    expect(screen.queryByText("FiatOnRamp")).not.toBeInTheDocument();
  });

  it("starts a deposit session and notifies the caller", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
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
    mockedAnchorDeposit.mockResolvedValue({
      session,
      challenge: { transaction: "AAAA...", networkPassphrase: "Test SDF Network" },
    });
    mockedGetAnchorSession.mockResolvedValue({ session });
    const onSessionStarted = vi.fn();
    const onInteractiveUrl = vi.fn();

    render(
      <AnchorDepositWithdrawModal
        open
        assetCode="USDC"
        kind="deposit"
        onClose={() => {}}
        onSessionStarted={onSessionStarted}
        onInteractiveUrl={onInteractiveUrl}
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
    await waitFor(() => {
      expect(onInteractiveUrl).toHaveBeenCalledWith("https://anchor.example.com/flow", "session-1");
    });
  });

  it("starts a withdrawal session and notifies the caller", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    const session: AnchorSession = {
      id: "session-2",
      userId: "user-1",
      anchorName: "TestAnchor",
      kind: "withdrawal",
      assetCode: "USDC",
      interactiveUrl: null,
      externalTransactionId: null,
      status: "incomplete",
      createdAt: "2026-08-29T10:00:00Z",
    };
    mockedAnchorWithdraw.mockResolvedValue({
      session,
      challenge: { transaction: "AAAA...", networkPassphrase: "Test SDF Network" },
    });
    const onSessionStarted = vi.fn();

    render(
      <AnchorDepositWithdrawModal
        open
        assetCode="USDC"
        kind="withdrawal"
        onClose={() => {}}
        onSessionStarted={onSessionStarted}
      />,
      { wrapper: createWrapper() }
    );

    await screen.findByText("TestAnchor");
    screen.getByRole("button", { name: /start withdrawal/i }).click();

    await waitFor(() => {
      expect(api.anchorWithdraw).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onSessionStarted).toHaveBeenCalledWith(session);
    });
  });

  it("disables start button until an anchor is chosen", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorDepositWithdrawModal open assetCode="ARST" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /start deposit/i })).toBeDisabled();
  });

  it("disables start button when no anchor supports the asset", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorDepositWithdrawModal open assetCode="ARST" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /start deposit/i })).toBeDisabled();
  });

  it("shows asset selection and allows switching between XLM and USDC", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    render(
      <AnchorDepositWithdrawModal open assetCode="USDC" kind="deposit" onClose={() => {}} />,
      { wrapper: createWrapper() }
    );

    expect(await screen.findByText("TestAnchor")).toBeInTheDocument();

    const xlmButton = screen.getByRole("button", { name: "XLM" });
    xlmButton.click();

    expect(screen.getByText("XLM")).toBeInTheDocument();
  });

  it("handles popup blocking with toast notification", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    const session: AnchorSession = {
      id: "session-3",
      userId: "user-1",
      anchorName: "TestAnchor",
      kind: "deposit",
      assetCode: "USDC",
      interactiveUrl: "https://anchor.example.com/flow",
      externalTransactionId: null,
      status: "incomplete",
      createdAt: "2026-08-29T10:00:00Z",
    };
    mockedAnchorDeposit.mockResolvedValue({
      session,
      challenge: { transaction: "AAAA...", networkPassphrase: "Test SDF Network" },
    });
    mockedGetAnchorSession.mockResolvedValue({ session });

    render(
      <AnchorDepositWithdrawModal
        open
        assetCode="USDC"
        kind="deposit"
        onClose={() => {}}
      />,
      { wrapper: createWrapper() }
    );

    await screen.findByText("TestAnchor");
    screen.getByRole("button", { name: /start deposit/i }).click();

    await waitFor(() => {
      expect(api.anchorDeposit).toHaveBeenCalled();
    });
  });

  it("transitions through state machine correctly", async () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    const session: AnchorSession = {
      id: "session-4",
      userId: "user-1",
      anchorName: "TestAnchor",
      kind: "deposit",
      assetCode: "USDC",
      interactiveUrl: null,
      externalTransactionId: null,
      status: "completed",
      createdAt: "2026-08-29T10:00:00Z",
    };
    mockedAnchorDeposit.mockResolvedValue({
      session,
      challenge: { transaction: "AAAA...", networkPassphrase: "Test SDF Network" },
    });

    render(
      <AnchorDepositWithdrawModal
        open
        assetCode="USDC"
        kind="deposit"
        onClose={() => {}}
      />,
      { wrapper: createWrapper() }
    );

    await screen.findByText("TestAnchor");
    expect(screen.getAllByText("USDC")).toHaveLength(2);
    screen.getByRole("button", { name: /start deposit/i }).click();

    await waitFor(() => {
      expect(api.anchorDeposit).toHaveBeenCalled();
    });
  });
});