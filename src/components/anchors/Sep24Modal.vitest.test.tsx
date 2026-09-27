import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Sep24Modal } from "./Sep24Modal";
import type { AnchorInfo } from "@/lib/types";

const { sessionQueryMock, toastMock } = vi.hoisted(() => ({
  sessionQueryMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/queries", () => ({
  useAnchorSession: (...args: unknown[]) => sessionQueryMock(...args),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/lib/stellar", () => {
  class WalletError extends Error {
    code: string;
    constructor(message: string, code = "unknown") {
      super(message);
      this.name = "WalletError";
      this.code = code;
    }
  }
  return {
    signXdr: vi.fn(),
    WalletError,
  };
});

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
    },
  };
});

const { api } = vi.mocked(await import("@/lib/api"), { deep: true });
const { signXdr, WalletError } = await import("@/lib/stellar");

const ANCHORS: AnchorInfo[] = [
  {
    name: "TestAnchor",
    homeDomain: "testanchor.example.com",
    assets: [{ code: "XLM", issuer: null }],
  },
  {
    name: "UsdcAnchor",
    homeDomain: "usdc.example.com",
    assets: [{ code: "USDC", issuer: "GISSUER" }],
  },
];

const SESSION = {
  id: "sess-1",
  userId: "user-1",
  anchorName: "TestAnchor",
  kind: "deposit",
  assetCode: "XLM",
  interactiveUrl: "https://testanchor.example.com/interactive",
  externalTransactionId: null,
  status: "pending_user_transfer_start",
  createdAt: "2024-05-01T12:00:00.000Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "Sep24Wrapper";
  return Wrapper;
}

function renderModal(props: Partial<ComponentProps<typeof Sep24Modal>> = {}) {
  return render(
    <Sep24Modal open onClose={() => {}} {...props} />,
    { wrapper: createWrapper() }
  );
}

/** Wait for the anchor catalogue to resolve, then activate the start control. */
async function clickStart() {
  await screen.findByText("TestAnchor");
  const button = screen.getByRole("button", { name: /start deposit/i });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionQueryMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  vi.mocked(api.listAnchors).mockResolvedValue({ anchors: ANCHORS } as never);
});

describe("Sep24Modal (#366)", () => {
  it("manages deposit/withdrawal and asset selection state", () => {
    renderModal();

    const deposit = screen.getByRole("button", { name: /fund your balance/i });
    const withdrawal = screen.getByRole("button", { name: /cash out to fiat/i });
    expect(deposit).toHaveAttribute("aria-pressed", "true");
    expect(withdrawal).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(withdrawal);
    expect(withdrawal).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/^withdraw xlm$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "USDC" }));
    expect(screen.getByRole("button", { name: "USDC" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText(/^withdraw usdc$/i)).toBeInTheDocument();
  });

  it("only offers anchors that support the selected asset", async () => {
    renderModal();
    // XLM is the default asset: only the XLM anchor should be listed.
    expect(await screen.findByText("TestAnchor")).toBeInTheDocument();
    expect(screen.queryByText("UsdcAnchor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "USDC" }));
    await waitFor(() => expect(screen.getByText("UsdcAnchor")).toBeInTheDocument());
    expect(screen.queryByText("TestAnchor")).not.toBeInTheDocument();
  });

  it("shows a loading state while the anchor catalogue is fetched", () => {
    vi.mocked(api.listAnchors).mockImplementation(() => new Promise(() => undefined));
    renderModal();
    expect(screen.getByText(/loading anchor options/i)).toBeInTheDocument();
  });

  it("surfaces an error state with retry when the catalogue fails", async () => {
    vi.mocked(api.listAnchors).mockRejectedValue(new Error("network down"));
    renderModal();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load anchor information/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(api.listAnchors).toHaveBeenCalledTimes(2);
  });

  it("explains when no anchor supports the asset", async () => {
    // The only configured anchor serves XLM, but the modal opens on USDC.
    vi.mocked(api.listAnchors).mockResolvedValue({ anchors: [ANCHORS[0]] } as never);

    renderModal({ defaultAssetCode: "USDC" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no anchors currently support/i);
    expect(alert).toHaveTextContent("USDC");
    expect(
      screen.getByRole("button", { name: /^start deposit/i })
    ).toBeDisabled();
  });

  it("starts a SEP-24 session, signs the challenge and embeds the page", async () => {
    vi.mocked(api.anchorDeposit).mockResolvedValue({
      session: { ...SESSION, interactiveUrl: null, status: "incomplete" },
      challenge: { transaction: "XDR", networkPassphrase: "Test" },
    } as never);
    vi.mocked(signXdr).mockResolvedValue("SIGNED_XDR" as never);
    vi.mocked(api.anchorComplete).mockResolvedValue({ session: SESSION } as never);

    const onSessionStarted = vi.fn();
    renderModal({ onSessionStarted });

    await clickStart();

    await waitFor(() =>
      expect(screen.getByTitle("SEP-24 interactive transfer")).toBeInTheDocument()
    );
    expect(api.anchorDeposit).toHaveBeenCalledWith({
      assetCode: "XLM",
      anchorName: "TestAnchor",
    });
    expect(signXdr).toHaveBeenCalledWith("XDR", "Test");
    expect(api.anchorComplete).toHaveBeenCalledWith("sess-1", {
      signedXdr: "SIGNED_XDR",
    });
    expect(onSessionStarted).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sess-1" })
    );
    expect(toastMock.success).toHaveBeenCalledWith(
      "Complete the transfer in the secure anchor window"
    );
    expect(
      screen.getByRole("button", { name: /open in new window/i })
    ).toBeInTheDocument();
  });

  it("reports a blocked pop-up instead of failing silently", async () => {
    vi.mocked(api.anchorDeposit).mockResolvedValue({
      session: { ...SESSION, interactiveUrl: null, status: "incomplete" },
      challenge: { transaction: "XDR", networkPassphrase: "Test" },
    } as never);
    vi.mocked(signXdr).mockResolvedValue("SIGNED_XDR" as never);
    vi.mocked(api.anchorComplete).mockResolvedValue({ session: SESSION } as never);

    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderModal();

    await clickStart();
    await screen.findByRole("button", { name: /open in new window/i });
    fireEvent.click(screen.getByRole("button", { name: /open in new window/i }));

    expect(open).toHaveBeenCalledWith(
      SESSION.interactiveUrl,
      "_blank",
      "noopener,noreferrer"
    );
    expect(toastMock.error).toHaveBeenCalledWith(
      expect.stringMatching(/blocked the pop-up/i)
    );
    open.mockRestore();
  });

  it("keeps the user on the setup step when the wallet refuses to sign", async () => {
    vi.mocked(api.anchorDeposit).mockResolvedValue({
      session: { ...SESSION, interactiveUrl: null, status: "incomplete" },
      challenge: { transaction: "XDR", networkPassphrase: "Test" },
    } as never);
    vi.mocked(signXdr).mockRejectedValue(new WalletError("Freighter is locked"));

    renderModal();
    await clickStart();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Freighter is locked")
    );
    expect(screen.queryByTitle("SEP-24 interactive transfer")).not.toBeInTheDocument();
    expect(api.anchorComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /start deposit/i })
    ).toBeInTheDocument();
  });

  it("handles an anchor that returns no interactive metadata", async () => {
    vi.mocked(api.anchorDeposit).mockResolvedValue({
      session: { ...SESSION, interactiveUrl: null, status: "incomplete" },
      challenge: { transaction: "XDR", networkPassphrase: "Test" },
    } as never);
    vi.mocked(signXdr).mockResolvedValue("SIGNED_XDR" as never);
    vi.mocked(api.anchorComplete).mockResolvedValue({
      session: { ...SESSION, interactiveUrl: null },
    } as never);

    renderModal();
    await clickStart();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/did not return an interactive page/i);
    expect(screen.queryByTitle("SEP-24 interactive transfer")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open in new window/i })
    ).not.toBeInTheDocument();
  });

  it("surfaces network failures when starting the session", async () => {
    vi.mocked(api.anchorDeposit).mockRejectedValue(new Error("gateway timeout"));
    renderModal();

    await clickStart();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("gateway timeout")
    );
    expect(signXdr).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /start deposit/i })
    ).toBeInTheDocument();
  });

  it("polls the session for status updates while open", async () => {
    sessionQueryMock.mockImplementation((id: string | null) =>
      id
        ? {
            data: { session: { ...SESSION, status: "pending_external" } },
            isLoading: false,
            isError: false,
          }
        : { data: undefined, isLoading: false, isError: false }
    );

    vi.mocked(api.anchorDeposit).mockResolvedValue({
      session: { ...SESSION, interactiveUrl: null, status: "incomplete" },
      challenge: { transaction: "XDR", networkPassphrase: "Test" },
    } as never);
    vi.mocked(signXdr).mockResolvedValue("SIGNED_XDR" as never);
    vi.mocked(api.anchorComplete).mockResolvedValue({ session: SESSION } as never);

    renderModal();
    await clickStart();

    await waitFor(() => expect(sessionQueryMock).toHaveBeenCalledWith("sess-1"));
    expect(await screen.findByText("pending external")).toBeInTheDocument();
  });
});
