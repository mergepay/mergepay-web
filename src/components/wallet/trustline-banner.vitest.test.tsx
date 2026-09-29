import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TrustlineAsset } from "@/lib/trustline";

interface CheckLike {
  status: "checking" | "ready" | "missing" | "disconnected" | "error";
  address: string | null;
  assets: TrustlineAsset[];
  missing: TrustlineAsset[];
  error: string | null;
  refresh: () => void;
}

const { mockCheck, stellar } = vi.hoisted(() => ({
  mockCheck: { current: null as unknown as CheckLike },
  stellar: { addTrustline: vi.fn(), hasTrustline: vi.fn() },
}));

vi.mock("@/hooks/useTrustlineRequirements", () => ({
  useTrustlineRequirements: () => mockCheck.current,
}));

vi.mock("@/lib/stellar", () => {
  class WalletError extends Error {
    code = "unknown";
  }
  return {
    addTrustline: stellar.addTrustline,
    hasTrustline: stellar.hasTrustline,
    WalletError,
    walletMessage: (code: string) => `message:${code}`,
    FREIGHTER_INSTALL_URL: "https://freighter.app",
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TrustlineBanner } from "./TrustlineBanner";
import { WalletError } from "@/lib/stellar";

const ADDRESS = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXQK7A";
const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const TX_HASH = "a".repeat(64);

/** A short poll window so the slow-network paths are testable in milliseconds. */
const FAST_POLL = { timeoutMs: 80, intervalMs: 20 };

function missingAsset(overrides: Partial<TrustlineAsset> = {}): TrustlineAsset {
  return {
    code: "USDC",
    issuer: ISSUER,
    name: "USD Coin",
    balance: "0.0000000",
    hasTrustline: false,
    ...overrides,
  };
}

function setCheck(overrides: Partial<CheckLike> = {}) {
  mockCheck.current = {
    status: "ready",
    address: ADDRESS,
    assets: [],
    missing: [],
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
  return mockCheck.current;
}

/**
 * The banner drives its submission through a React Query mutation, so it needs
 * the provider the app gives it in `app/providers.tsx`.
 */
function renderBanner(props: { poll?: { timeoutMs?: number; intervalMs?: number } } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <TrustlineBanner {...props} />
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

function clickAdd() {
  fireEvent.click(screen.getByRole("button", { name: /add usdc trustline/i }));
}

describe("TrustlineBanner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setCheck();
    // Default: the network shows the trustline the first time it is asked.
    stellar.hasTrustline.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while the wallet is ready", () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no wallet is connected or the check errored", () => {
    setCheck({ status: "disconnected", address: null });
    const disconnected = renderBanner();
    expect(disconnected.container).toBeEmptyDOMElement();
    disconnected.unmount();

    setCheck({ status: "error", error: "boom" });
    const errored = renderBanner();
    expect(errored.container).toBeEmptyDOMElement();
  });

  it("warns about a missing trustline and offers a CTA", () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    renderBanner();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /usdc trustline required/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add usdc trustline/i })).toBeInTheDocument();
  });

  it("runs the Freighter flow and confirms with a toast", async () => {
    const check = setCheck({ status: "missing", missing: [missingAsset()] });
    stellar.addTrustline.mockResolvedValue({ txHash: TX_HASH });
    renderBanner();

    clickAdd();

    await waitFor(() =>
      expect(stellar.addTrustline).toHaveBeenCalledWith(
        ADDRESS,
        "USDC",
        ISSUER,
        expect.any(Function)
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/usdc trustline confirmed/i)
      )
    );
    expect(check.refresh).toHaveBeenCalled();
  });

  it("surfaces a wallet failure with stable copy", async () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    const failure = new WalletError("locked");
    failure.code = "locked";
    stellar.addTrustline.mockRejectedValue(failure);
    renderBanner();

    clickAdd();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("message:locked"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains when an asset has no issuer to trust", () => {
    setCheck({ status: "missing", missing: [missingAsset({ issuer: null })] });
    renderBanner();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add usdc trustline/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/missing an issuer/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Submission progress states (#545)
  // -------------------------------------------------------------------------

  it("names the leg the user is waiting on while the flow runs", async () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    const gate = deferred<{ txHash: string }>();
    stellar.addTrustline.mockImplementation(
      (
        _address: string,
        _code: string,
        _issuer: string,
        onPhase?: (phase: string) => void
      ) => {
        onPhase?.("signing");
        return gate.promise;
      }
    );
    renderBanner({ poll: FAST_POLL });

    clickAdd();

    expect(await screen.findByText(/signature in Freighter/i)).toBeInTheDocument();

    const progress = screen.getByRole("list", { name: /usdc trustline progress/i });
    expect(progress).toHaveTextContent(/Prepare/);
    expect(progress).toHaveTextContent(/Confirm/);
    expect(progress.querySelector("[aria-current=step]")).toHaveTextContent("Sign");

    gate.resolve({ txHash: TX_HASH });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("waits for the network before calling the trustline confirmed", async () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    stellar.addTrustline.mockResolvedValue({ txHash: TX_HASH });
    // Hold the first probe open: the confirm leg is then genuinely in flight
    // while we look at it, instead of us racing a poll that finishes in one
    // tick.
    const gate = deferred<boolean>();
    stellar.hasTrustline.mockReturnValue(gate.promise);
    renderBanner({ poll: { timeoutMs: 5_000, intervalMs: 20 } });

    clickAdd();

    expect(await screen.findByText(/waiting for the network/i)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText(/add usdc trustline/i)).toBeInTheDocument();

    // The account now shows the trustline: the poll resolves and only then is
    // the banner allowed to say it is confirmed.
    await act(async () => {
      gate.resolve(true);
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/usdc trustline confirmed/i)
      )
    );
  });

  it("offers to check again after a slow confirmation, with the tx hash", async () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    stellar.addTrustline.mockResolvedValue({ txHash: TX_HASH });
    // Every read fails: a Horizon hiccup must not be reported as a bad tx.
    stellar.hasTrustline.mockRejectedValue(new Error("horizon unavailable"));
    renderBanner({ poll: FAST_POLL });

    clickAdd();

    expect(await screen.findByText(/still confirming/i)).toBeInTheDocument();
    expect(screen.getByText(/signing a second one/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check again/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /stellar explorer/i })
    ).toHaveAttribute("target", "_blank");
    // Retrying the whole flow is deliberately absent: it would sign twice.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("re-checks without signing a second transaction", async () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    stellar.addTrustline.mockResolvedValue({ txHash: TX_HASH });
    // The trustline never appears, so the first attempt ends at the deadline.
    stellar.hasTrustline.mockResolvedValue(false);
    renderBanner({ poll: FAST_POLL });

    clickAdd();
    const checkAgain = await screen.findByRole("button", { name: /check again/i });
    const signedBefore = stellar.addTrustline.mock.calls.length;
    // The recovery button has to be clickable the moment it appears: a latch
    // that outlives the failed run by a tick looks like a hung app.
    expect(checkAgain).toBeEnabled();

    // Now the account does show it: the re-check finishes the job on its own.
    stellar.hasTrustline.mockResolvedValue(true);
    fireEvent.click(checkAgain);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/usdc trustline confirmed/i)
      )
    );
    expect(stellar.addTrustline.mock.calls.length).toBe(signedBefore);
  });

  it("offers to install Freighter when there is no wallet to sign", async () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    const failure = new WalletError("not found");
    failure.code = "not_installed";
    stellar.addTrustline.mockRejectedValue(failure);
    renderBanner({ poll: FAST_POLL });

    clickAdd();

    const install = await screen.findByRole("button", { name: /install freighter/i });
    expect(install.closest("a")).toHaveAttribute("href", "https://freighter.app");
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
