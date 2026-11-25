import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Sep24Modal, isSecureAnchorUrl } from "../Sep24Modal";
import { useAuth } from "@/lib/auth-store";
import { useAssetStore } from "@/lib/asset-store";
import type { AnchorInfo, AnchorSession } from "@/lib/types";

const usdcIssuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const testAnchors: AnchorInfo[] = [
  {
    name: "AnchorX",
    homeDomain: "anchorx.example.com",
    assets: [
      { code: "USDC", issuer: usdcIssuer },
      { code: "XLM", issuer: null },
    ],
  },
  {
    name: "AnchorY",
    homeDomain: "anchory.example.com",
    assets: [{ code: "USDC", issuer: usdcIssuer }],
  },
];

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/stellar", () => ({
  WalletError: class WalletError extends Error {
    code = "unknown";
  },
  NotInstalledMessage: () => null,
  signXdr: vi.fn().mockResolvedValue("signed-xdr-payload"),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listAnchors: vi.fn(),
      anchorDeposit: vi.fn(),
      anchorWithdraw: vi.fn(),
      anchorComplete: vi.fn(),
      anchorSession: vi.fn(),
    },
  };
});

const { api } = vi.mocked(await import("@/lib/api"), { deep: true });
const { toast } = await import("sonner");

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("Sep24Modal Acceptance Criteria (#727)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      token: "auth-jwt-token",
      user: {
        id: "user-1",
        stellarPublicKey: usdcIssuer,
        displayName: "Alice",
        avatarUrl: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    });
    useAssetStore.setState({ activeAsset: { code: "USDC", issuer: usdcIssuer } });

    vi.mocked(api.listAnchors).mockResolvedValue({ anchors: testAnchors });
    vi.mocked(api.anchorSession).mockResolvedValue({
      session: {
        id: "sess-1",
        userId: "user-1",
        anchorName: "AnchorX",
        kind: "deposit",
        assetCode: "USDC",
        interactiveUrl: null,
        externalTransactionId: null,
        status: "incomplete",
        createdAt: new Date().toISOString(),
      },
    });
    vi.mocked(api.anchorDeposit).mockResolvedValue({
      session: {
        id: "sess-dep-1",
        userId: "user-1",
        anchorName: "AnchorX",
        kind: "deposit",
        assetCode: "USDC",
        interactiveUrl: "https://anchorx.example.com/interactive?id=1",
        externalTransactionId: null,
        status: "pending_anchor",
        createdAt: new Date().toISOString(),
      },
      challenge: {
        transaction: "challenge-xdr",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    });
    vi.mocked(api.anchorWithdraw).mockResolvedValue({
      session: {
        id: "sess-wth-1",
        userId: "user-1",
        anchorName: "AnchorX",
        kind: "withdrawal",
        assetCode: "USDC",
        interactiveUrl: "https://anchorx.example.com/withdraw?id=1",
        externalTransactionId: null,
        status: "pending_anchor",
        createdAt: new Date().toISOString(),
      },
      challenge: {
        transaction: "challenge-xdr",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    });
    vi.mocked(api.anchorComplete).mockImplementation(async (id) => ({
      session: {
        id,
        userId: "user-1",
        anchorName: "AnchorX",
        kind: "deposit",
        assetCode: "USDC",
        interactiveUrl: "https://anchorx.example.com/interactive?id=1",
        externalTransactionId: null,
        status: "pending_anchor",
        createdAt: new Date().toISOString(),
      },
    }));
  });

  afterEach(() => {
    useAuth.setState({ token: null, user: null });
  });

  it("renders deposit mode with neobrutalist header and currency controls", async () => {
    render(<Sep24Modal open={true} onClose={vi.fn()} kind="deposit" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getAllByText(/Deposit/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Fund your balance/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "USDC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "XLM" })).toBeInTheDocument();
  });

  it("switches currency between USDC and XLM when toggled", async () => {
    render(<Sep24Modal open={true} onClose={vi.fn()} kind="deposit" />, {
      wrapper: createWrapper(),
    });

    const xlmBtn = screen.getByRole("button", { name: "XLM" });
    fireEvent.click(xlmBtn);

    expect(xlmBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("renders withdrawal mode correctly", async () => {
    render(
      <Sep24Modal open={true} onClose={vi.fn()} kind="withdrawal" assetCode="USDC" />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/Withdraw USDC/i)).toBeInTheDocument();
    expect(screen.getByText(/Withdraw to fiat/i)).toBeInTheDocument();
  });

  it("validates secure anchor URLs with isSecureAnchorUrl", () => {
    expect(isSecureAnchorUrl("https://example.com/interactive")).toBe(true);
    expect(isSecureAnchorUrl("http://insecure.com/interactive")).toBe(false);
    expect(isSecureAnchorUrl("javascript:alert(1)")).toBe(false);
    expect(isSecureAnchorUrl("")).toBe(false);
    expect(isSecureAnchorUrl(null)).toBe(false);
  });

  it("starts anchor session and notifies via sonner toast", async () => {
    render(
      <Sep24Modal
        open={true}
        onClose={vi.fn()}
        kind="deposit"
        assetCode="USDC"
        preferredAnchorName="AnchorX"
      />,
      { wrapper: createWrapper() }
    );

    await screen.findByText("AnchorX");
    const startBtn = screen.getByRole("button", { name: /Start Deposit/i });

    await act(async () => {
      fireEvent.click(startBtn);
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Deposit session started"),
        expect.anything()
      );
    });
  });
});
