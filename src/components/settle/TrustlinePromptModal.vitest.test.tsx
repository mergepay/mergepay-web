import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WalletBuildPhase } from "@/lib/walletSubmission";
import { TrustlinePromptModal, type TrustlineAssetInfo } from "./TrustlinePromptModal";
import { TrustlineDetectionBanner } from "./TrustlineDetectionBanner";

// Mock stellar functions
vi.mock("@/lib/stellar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar")>("@/lib/stellar");
  return {
    ...actual,
    hasTrustline: vi.fn(),
    addTrustline: vi.fn(),
  };
});

const { hasTrustline, addTrustline } = vi.mocked(
  await import("@/lib/stellar")
);

const PUBLIC_KEY = "GTEST123";
const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const TX_HASH = "a".repeat(64);

const usdcAsset: TrustlineAssetInfo = {
  code: "USDC",
  issuer: ISSUER,
  name: "USD Coin",
};

const xlmAsset: TrustlineAssetInfo = {
  code: "XLM",
  issuer: null,
  name: "Lumen",
};

/** Short poll window, so the slow-confirmation paths run in milliseconds. */
const FAST_POLL = { timeoutMs: 80, intervalMs: 20 };

/**
 * The modal drives its submission through a React Query mutation, so it needs
 * the provider the app gives it in `app/providers.tsx`.
 */
function renderModal(
  props: Partial<{
    open: boolean;
    onClose: () => void;
    assets: TrustlineAssetInfo[];
    onReady: () => void;
    poll: { timeoutMs?: number; intervalMs?: number };
  }> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <TrustlinePromptModal
        open={props.open ?? true}
        onClose={props.onClose ?? vi.fn()}
        publicKey={PUBLIC_KEY}
        assets={props.assets ?? [usdcAsset]}
        onReady={props.onReady ?? vi.fn()}
        poll={props.poll}
      />
    </QueryClientProvider>
  );
  return { ...utils, client };
}

/** Hold a promise open so the UI can be inspected while a leg is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Wait for the detection to land, then press the row's Enable button. */
async function enableMissingTrustline() {
  await waitFor(() => {
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("button", { name: /enable/i }));
}

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TrustlinePromptModal
// ---------------------------------------------------------------------------

describe("TrustlinePromptModal", () => {
  beforeEach(() => {
    // Default: the network shows the trustline whenever it is asked.
    hasTrustline.mockResolvedValue(true);
  });

  it("renders nothing when closed", () => {
    const { container } = renderModal({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("shows checking state initially", () => {
    hasTrustline.mockReturnValue(new Promise(() => {})); // never resolves
    renderModal();
    expect(screen.getByText("Trustline Setup Required")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("shows missing status when trustline is not present", async () => {
    hasTrustline.mockResolvedValue(false);
    renderModal();
    await waitFor(() => {
      expect(screen.getByText("Missing")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
  });

  it("shows ready status when trustline is present", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
  });

  it("calls onReady when all trustlines are already present", async () => {
    const onReady = vi.fn();
    renderModal({ onReady });
    await waitFor(() => {
      expect(onReady).toHaveBeenCalled();
    });
  });

  it("shows error status when trustline check fails", async () => {
    hasTrustline.mockRejectedValue(new Error("network error"));
    renderModal();
    await waitFor(() => {
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
    expect(screen.getByText(/Could not verify trustline/)).toBeInTheDocument();
  });

  it("renders native asset as ready without checking", async () => {
    const onReady = vi.fn();
    renderModal({ assets: [xlmAsset], onReady });
    await waitFor(() => {
      expect(screen.getByText("Native")).toBeInTheDocument();
      expect(screen.getByText("No setup needed")).toBeInTheDocument();
    });
    expect(hasTrustline).not.toHaveBeenCalled();
  });

  it("shows Continue button when all trustlines ready", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/All trustlines are ready/)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /continue to settlement/i })
    ).toBeInTheDocument();
  });

  it("calls onClose when Close is clicked", async () => {
    hasTrustline.mockResolvedValue(false);
    const onClose = vi.fn();
    renderModal({ onClose });
    // Wait for trustline check to complete
    await waitFor(() => {
      expect(screen.getByText("Missing")).toBeInTheDocument();
    });
    // The footer "Close" button has exact text "Close" and no aria-label
    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    const footerClose = closeButtons.find((btn) => !btn.getAttribute("aria-label"));
    fireEvent.click(footerClose ?? closeButtons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Submission lifecycle (#545)
  // -------------------------------------------------------------------------

  it("enables a missing trustline and marks it active once the network shows it", async () => {
    // The first read (the initial check) says missing; the poll says present.
    hasTrustline.mockResolvedValueOnce(false).mockResolvedValue(true);
    addTrustline.mockResolvedValue({ txHash: TX_HASH });
    const onReady = vi.fn();
    renderModal({ onReady, poll: FAST_POLL });

    await enableMissingTrustline();

    await waitFor(() => {
      expect(addTrustline).toHaveBeenCalledWith(
        PUBLIC_KEY,
        "USDC",
        ISSUER,
        expect.any(Function)
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
    expect(
      screen.getByText("All trustlines are ready. You can proceed with settlement.")
    ).toBeInTheDocument();
    // The settlement flow is only unblocked once the trustline is on-chain.
    expect(onReady).toHaveBeenCalled();
  });

  it("names the leg the user is waiting on while the flow runs", async () => {
    hasTrustline.mockResolvedValue(false);
    const gate = deferred<{ txHash: string }>();
    addTrustline.mockImplementation(
      (
        _key: string,
        _code: string,
        _issuer: string,
        onPhase?: (phase: WalletBuildPhase) => void
      ) => {
        onPhase?.("signing");
        return gate.promise;
      }
    );
    renderModal({ poll: FAST_POLL });

    await enableMissingTrustline();

    expect(await screen.findByText(/signature in Freighter/i)).toBeInTheDocument();
    expect(screen.getByText("Enabling…")).toBeInTheDocument();
    expect(
      screen
        .getByRole("list", { name: /usdc trustline progress/i })
        .querySelector("[aria-current=step]")
    ).toHaveTextContent("Sign");

    gate.resolve({ txHash: TX_HASH });
    hasTrustline.mockResolvedValue(true);
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
  });

  it("waits for the network before calling the trustline active", async () => {
    hasTrustline.mockResolvedValueOnce(false);
    addTrustline.mockResolvedValue({ txHash: TX_HASH });
    // Hold the confirmation probe open: the poll is then genuinely in flight
    // while we look at it, instead of us racing a poll that ends in one tick.
    const gate = deferred<boolean>();
    hasTrustline.mockReturnValue(gate.promise);
    const onReady = vi.fn();
    renderModal({ onReady, poll: { timeoutMs: 5_000, intervalMs: 20 } });

    await enableMissingTrustline();

    expect(await screen.findByText(/waiting for the network/i)).toBeInTheDocument();
    expect(screen.getByText("Confirming…")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve(true);
    });
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(onReady).toHaveBeenCalled();
    });
  });

  it("offers to check a slow confirmation instead of signing a second transaction", async () => {
    hasTrustline.mockResolvedValue(false);
    addTrustline.mockResolvedValue({ txHash: TX_HASH });
    renderModal({ poll: FAST_POLL });

    await enableMissingTrustline();

    expect(await screen.findByText(/still confirming/i)).toBeInTheDocument();
    expect(screen.getByText("Unconfirmed")).toBeInTheDocument();
    expect(screen.getByText(/signing a second one/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check again/i })).toBeInTheDocument();
    // The hash is the user's proof of what their wallet signed, so it stays.
    expect(
      screen.getByRole("link", { name: /stellar explorer/i })
    ).toHaveAttribute("target", "_blank");
    // Retrying the whole flow is deliberately absent: it would sign twice.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("re-checks without asking the wallet to sign again", async () => {
    hasTrustline.mockResolvedValue(false);
    addTrustline.mockResolvedValue({ txHash: TX_HASH });
    renderModal({ poll: FAST_POLL });

    await enableMissingTrustline();

    const checkAgain = await screen.findByRole("button", { name: /check again/i });
    const signedBefore = addTrustline.mock.calls.length;
    // The recovery button has to be clickable the moment it appears: a latch
    // that outlives the failed run by a tick looks like a hung app.
    expect(checkAgain).toBeEnabled();

    hasTrustline.mockResolvedValue(true);
    fireEvent.click(checkAgain);

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
    expect(addTrustline.mock.calls.length).toBe(signedBefore);
  });

  it("offers the recovery that fits a declined signature", async () => {
    hasTrustline.mockResolvedValue(false);
    addTrustline.mockRejectedValue(
      Object.assign(new Error("User rejected"), { code: "user_rejected" })
    );
    renderModal({ poll: FAST_POLL });

    await enableMissingTrustline();

    expect(await screen.findByText(/signature declined/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // Nothing reached the network, so there is no hash to link to.
    expect(
      screen.queryByRole("link", { name: /stellar explorer/i })
    ).not.toBeInTheDocument();
  });

  it("offers to install Freighter when there is no wallet to sign", async () => {
    hasTrustline.mockResolvedValue(false);
    addTrustline.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "not_installed" })
    );
    renderModal({ poll: FAST_POLL });

    await enableMissingTrustline();

    const install = await screen.findByRole("button", { name: /install freighter/i });
    expect(install.closest("a")).toHaveAttribute("href", "https://freighter.app");
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("does not ask the wallet to sign twice for one click", async () => {
    hasTrustline.mockResolvedValue(false);
    const gate = deferred<{ txHash: string }>();
    addTrustline.mockReturnValue(gate.promise);
    renderModal({ poll: FAST_POLL });

    await enableMissingTrustline();

    // The CTA is replaced by the in-flight spinner: a second activation of the
    // same row would open a second Freighter popup.
    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();

    gate.resolve({ txHash: TX_HASH });
    hasTrustline.mockResolvedValue(true);
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
    expect(addTrustline.mock.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TrustlineDetectionBanner
// ---------------------------------------------------------------------------

describe("TrustlineDetectionBanner", () => {
  it("renders nothing for native assets (XLM)", () => {
    const { container } = render(
      <TrustlineDetectionBanner
        publicKey={PUBLIC_KEY}
        assetCode="XLM"
        assetIssuer={null}
        onSetupTrustline={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows checking state initially", () => {
    hasTrustline.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <TrustlineDetectionBanner
        publicKey={PUBLIC_KEY}
        assetCode="USDC"
        assetIssuer={ISSUER}
        onSetupTrustline={vi.fn()}
      />
    );
    expect(screen.getByText(/Checking USDC trustline/)).toBeInTheDocument();
  });

  it("shows ok status when trustline is present", async () => {
    hasTrustline.mockResolvedValue(true);
    render(
      <TrustlineDetectionBanner
        publicKey={PUBLIC_KEY}
        assetCode="USDC"
        assetIssuer={ISSUER}
        onSetupTrustline={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/trustline is active/)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
  });

  it("shows missing status with Enable button when trustline is absent", async () => {
    hasTrustline.mockResolvedValue(false);
    const onSetup = vi.fn();
    render(
      <TrustlineDetectionBanner
        publicKey={PUBLIC_KEY}
        assetCode="USDC"
        assetIssuer={ISSUER}
        onSetupTrustline={onSetup}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/needs a/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /enable/i }));
    expect(onSetup).toHaveBeenCalled();
  });

  it("shows error status when check fails", async () => {
    hasTrustline.mockRejectedValue(new Error("network"));
    render(
      <TrustlineDetectionBanner
        publicKey={PUBLIC_KEY}
        assetCode="USDC"
        assetIssuer={ISSUER}
        onSetupTrustline={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Could not verify/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /check/i })).toBeInTheDocument();
  });
});
