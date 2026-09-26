import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Sep24Modal, isSecureAnchorUrl } from "./Sep24Modal";
import { useAuth } from "@/lib/auth-store";
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
  signXdr: vi.fn().mockResolvedValue("signed-xdr"),
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

const mockedListAnchors = vi.mocked(api.listAnchors);
const mockedAnchorDeposit = vi.mocked(api.anchorDeposit);
const mockedAnchorWithdraw = vi.mocked(api.anchorWithdraw);
const mockedAnchorComplete = vi.mocked(api.anchorComplete);
const mockedAnchorSession = vi.mocked(api.anchorSession);

function makeSession(overrides: Partial<AnchorSession> = {}): AnchorSession {
  return {
    id: "session-1",
    userId: "user-1",
    anchorName: "TestAnchor",
    kind: "deposit",
    assetCode: "USDC",
    interactiveUrl: null,
    externalTransactionId: null,
    status: "incomplete",
    createdAt: "2026-09-24T10:00:00Z",
    ...overrides,
  };
}

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

function signIn() {
  useAuth.setState({
    token: "test-token",
    user: {
      id: "user-1",
      stellarPublicKey:
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      displayName: "Test User",
      avatarUrl: null,
      createdAt: "2026-09-24T10:00:00Z",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.setState({ token: null, user: null });
  mockedAnchorSession.mockResolvedValue({ session: makeSession() });
});

describe("isSecureAnchorUrl", () => {
  it("accepts only https URLs", () => {
    expect(isSecureAnchorUrl("https://anchor.example.com/flow")).toBe(true);
    expect(isSecureAnchorUrl("http://anchor.example.com/flow")).toBe(false);
    expect(isSecureAnchorUrl("javascript:alert(1)")).toBe(false);
    expect(isSecureAnchorUrl("not a url")).toBe(false);
    expect(isSecureAnchorUrl(null)).toBe(false);
  });
});

describe("Sep24Modal (#374)", () => {
  it("gates the flow behind the authenticated session", () => {
    mockedListAnchors.mockResolvedValue({ anchors });
    render(<Sep24Modal open kind="deposit" onClose={() => {}} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByText(/sign in with your wallet to start a fiat transfer/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start deposit/i })).toBeDisabled();
  });

  it("shows the loading state while the anchor catalogue is fetched", () => {
    signIn();
    mockedListAnchors.mockImplementation(() => new Promise(() => undefined));
    render(<Sep24Modal open kind="deposit" onClose={() => {}} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText(/loading anchor options/i)).toBeInTheDocument();
  });

  it("shows an error state with retry when the anchor request fails", async () => {
    signIn();
    mockedListAnchors.mockRejectedValue(new Error("network down"));
    render(<Sep24Modal open kind="deposit" onClose={() => {}} />, {
      wrapper: createWrapper(),
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load anchor information/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows an empty state when no anchor supports the asset", async () => {
    signIn();
    mockedListAnchors.mockResolvedValue({ anchors });
    render(<Sep24Modal open kind="deposit" assetCode="ARST" onClose={() => {}} />, {
      wrapper: createWrapper(),
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no anchors currently support/i);
  });

  it("lists only anchors supporting the requested asset", async () => {
    signIn();
    mockedListAnchors.mockResolvedValue({ anchors });
    render(<Sep24Modal open kind="withdrawal" onClose={() => {}} />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByText("TestAnchor")).toBeInTheDocument();
    expect(screen.queryByText("FiatOnRamp")).not.toBeInTheDocument();
  });

  it("runs the full deposit flow and embeds the interactive URL", async () => {
    signIn();
    mockedListAnchors.mockResolvedValue({ anchors });
    const session = makeSession();
    const completed = makeSession({
      interactiveUrl: "https://anchor.example.com/flow",
    });
    mockedAnchorDeposit.mockResolvedValue({
      session,
      challenge: {
        transaction: "AAAA...",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    });
    mockedAnchorComplete.mockResolvedValue({ session: completed });

    const onSessionStarted = vi.fn();
    render(
      <Sep24Modal
        open
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
      expect(api.anchorComplete).toHaveBeenCalledWith("session-1", {
        signedXdr: "signed-xdr",
      });
    });
    await waitFor(() => {
      expect(onSessionStarted).toHaveBeenCalledWith(completed);
    });

    const frame = await screen.findByTitle("SEP-24 anchor transfer");
    expect(frame).toHaveAttribute("src", "https://anchor.example.com/flow");
    expect(toast.success).toHaveBeenCalled();
  });

  it("routes withdrawal through the withdraw endpoint", async () => {
    signIn();
    mockedListAnchors.mockResolvedValue({ anchors });
    const session = makeSession({ kind: "withdrawal" });
    mockedAnchorWithdraw.mockResolvedValue({
      session,
      challenge: { transaction: "AAAA...", networkPassphrase: "Test SDF Network" },
    });
    mockedAnchorComplete.mockResolvedValue({
      session: makeSession({
        kind: "withdrawal",
        interactiveUrl: "https://anchor.example.com/withdraw",
      }),
    });

    render(<Sep24Modal open kind="withdrawal" onClose={() => {}} />, {
      wrapper: createWrapper(),
    });

    await screen.findByText("TestAnchor");
    screen.getByRole("button", { name: /start withdrawal/i }).click();

    await waitFor(() => {
      expect(api.anchorWithdraw).toHaveBeenCalledWith({
        assetCode: "USDC",
        anchorName: "TestAnchor",
      });
    });
    expect(api.anchorDeposit).not.toHaveBeenCalled();
  });

  it("never embeds a non-https interactive URL and warns instead", async () => {
    signIn();
    mockedListAnchors.mockResolvedValue({ anchors });
    const session = makeSession();
    mockedAnchorDeposit.mockResolvedValue({
      session,
      challenge: { transaction: "AAAA...", networkPassphrase: "Test SDF Network" },
    });
    mockedAnchorComplete.mockResolvedValue({
      session: makeSession({ interactiveUrl: "http://insecure.example.com/flow" }),
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<Sep24Modal open kind="deposit" onClose={() => {}} />, {
      wrapper: createWrapper(),
    });

    await screen.findByText("TestAnchor");
    screen.getByRole("button", { name: /start deposit/i }).click();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/insecure transfer URL/i)
      );
    });
    expect(screen.queryByTitle("SEP-24 anchor transfer")).not.toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
