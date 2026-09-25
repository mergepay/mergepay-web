import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  stellar: { addTrustline: vi.fn() },
}));

vi.mock("@/hooks/useTrustlineCheck", () => ({
  useTrustlineCheck: () => mockCheck.current,
}));

vi.mock("@/lib/stellar", () => {
  class WalletError extends Error {
    code = "unknown";
  }
  return {
    addTrustline: stellar.addTrustline,
    WalletError,
    walletMessage: (code: string) => `message:${code}`,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TrustlineBanner } from "./TrustlineBanner";
import { WalletError } from "@/lib/stellar";

const ADDRESS = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXQK7A";
const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

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

describe("TrustlineBanner", () => {
  beforeEach(() => {
    setCheck();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while the wallet is ready", () => {
    const { container } = render(<TrustlineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no wallet is connected or the check errored", () => {
    setCheck({ status: "disconnected", address: null });
    const disconnected = render(<TrustlineBanner />);
    expect(disconnected.container).toBeEmptyDOMElement();
    disconnected.unmount();

    setCheck({ status: "error", error: "boom" });
    const errored = render(<TrustlineBanner />);
    expect(errored.container).toBeEmptyDOMElement();
  });

  it("warns about a missing trustline and offers a CTA", () => {
    setCheck({ status: "missing", missing: [missingAsset()] });
    render(<TrustlineBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /usdc trustline required/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add usdc trustline/i })
    ).toBeInTheDocument();
  });

  it("runs the Freighter flow and confirms with a toast", async () => {
    const check = setCheck({ status: "missing", missing: [missingAsset()] });
    stellar.addTrustline.mockResolvedValue({ txHash: "a".repeat(64) });
    render(<TrustlineBanner />);

    fireEvent.click(screen.getByRole("button", { name: /add usdc trustline/i }));

    await waitFor(() =>
      expect(stellar.addTrustline).toHaveBeenCalledWith(
        ADDRESS,
        "USDC",
        ISSUER
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
    render(<TrustlineBanner />);

    fireEvent.click(screen.getByRole("button", { name: /add usdc trustline/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("message:locked")
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains when an asset has no issuer to trust", () => {
    setCheck({ status: "missing", missing: [missingAsset({ issuer: null })] });
    render(<TrustlineBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add usdc trustline/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/missing an issuer/i)).toBeInTheDocument();
  });
});
