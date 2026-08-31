import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const usdcAsset: TrustlineAssetInfo = {
  code: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  name: "USD Coin",
};

const xlmAsset: TrustlineAssetInfo = {
  code: "XLM",
  issuer: null,
  name: "Lumen",
};

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TrustlinePromptModal
// ---------------------------------------------------------------------------

describe("TrustlinePromptModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <TrustlinePromptModal
        open={false}
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows checking state initially", async () => {
    hasTrustline.mockResolvedValue(false);
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
    expect(screen.getByText("Trustline Setup Required")).toBeInTheDocument();
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("shows missing status when trustline is not present", async () => {
    hasTrustline.mockResolvedValue(false);
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Missing")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
  });

  it("shows ready status when trustline is present", async () => {
    hasTrustline.mockResolvedValue(true);
    const onReady = vi.fn();
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={onReady}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
  });

  it("calls onReady when all trustlines are already present", async () => {
    hasTrustline.mockResolvedValue(true);
    const onReady = vi.fn();
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={onReady}
      />
    );
    await waitFor(() => {
      expect(onReady).toHaveBeenCalled();
    });
  });

  it("shows error status when trustline check fails", async () => {
    hasTrustline.mockRejectedValue(new Error("network error"));
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
    expect(screen.getByText(/Could not verify trustline/)).toBeInTheDocument();
  });

  it("allows adding trustline and shows success", async () => {
    hasTrustline.mockResolvedValue(false);
    addTrustline.mockResolvedValue({ txHash: "tx-hash-1" });
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /enable/i }));
    await waitFor(() => {
      expect(addTrustline).toHaveBeenCalledWith(
        "GTEST123",
        "USDC",
        "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
      );
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
  });

  it("shows error when addTrustline fails", async () => {
    hasTrustline.mockResolvedValue(false);
    addTrustline.mockRejectedValue(new Error("User rejected"));
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /enable/i }));
    await waitFor(() => {
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });
  });

  it("renders native asset as ready without checking", async () => {
    const onReady = vi.fn();
    render(
      <TrustlinePromptModal
        open
        onClose={vi.fn()}
        publicKey="GTEST123"
        assets={[xlmAsset]}
        onReady={onReady}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Native")).toBeInTheDocument();
      expect(screen.getByText("No setup needed")).toBeInTheDocument();
    });
  });

  it("shows Continue button when all trustlines ready", async () => {
    hasTrustline.mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <TrustlinePromptModal
        open
        onClose={onClose}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/All trustlines are ready/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /continue to settlement/i })).toBeInTheDocument();
  });

  it("calls onClose when Close is clicked", async () => {
    hasTrustline.mockResolvedValue(false);
    const onClose = vi.fn();
    render(
      <TrustlinePromptModal
        open
        onClose={onClose}
        publicKey="GTEST123"
        assets={[usdcAsset]}
        onReady={vi.fn()}
      />
    );
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
});

// ---------------------------------------------------------------------------
// TrustlineDetectionBanner
// ---------------------------------------------------------------------------

describe("TrustlineDetectionBanner", () => {
  it("renders nothing for native assets (XLM)", () => {
    const { container } = render(
      <TrustlineDetectionBanner
        publicKey="GTEST123"
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
        publicKey="GTEST123"
        assetCode="USDC"
        assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
        onSetupTrustline={vi.fn()}
      />
    );
    expect(screen.getByText(/Checking USDC trustline/)).toBeInTheDocument();
  });

  it("shows ok status when trustline is present", async () => {
    hasTrustline.mockResolvedValue(true);
    render(
      <TrustlineDetectionBanner
        publicKey="GTEST123"
        assetCode="USDC"
        assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
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
        publicKey="GTEST123"
        assetCode="USDC"
        assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
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
        publicKey="GTEST123"
        assetCode="USDC"
        assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
        onSetupTrustline={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Could not verify/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /check/i })).toBeInTheDocument();
  });
});
