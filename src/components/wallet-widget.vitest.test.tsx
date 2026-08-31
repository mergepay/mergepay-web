import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";
import { WalletWidget } from "./WalletWidget";
import {
  UserRejectedError,
  WalletLockedError,
} from "@/lib/stellar";

/** Render the widget with a sonner <Toaster /> so toasts are queryable. */
function renderWidget(ui: React.ReactElement) {
  return render(
    <>
      <Toaster position="top-center" />
      {ui}
    </>
  );
}

const { walletStatus, stellarMock } = vi.hoisted(() => {
  const baseStatus = {
    kind: "connected",
    label: "Connected",
    message: "Connected to Testnet. Mergepay never sees your keys.",
    actionLabel: null,
    actionKind: null,
    tone: "lime",
    canSign: true,
    address: "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXQK7A",
    networkName: "TESTNET",
    refresh: vi.fn(),
  };
  return {
    walletStatus: baseStatus as {
      kind: string;
      label: string;
      message: string;
      actionLabel: string | null;
      actionKind: string | null;
      tone: string;
      canSign: boolean;
      address: string | null;
      networkName: string | null;
      refresh: () => void;
    },
    stellarMock: {
      getWalletAssets: vi.fn(),
      addTrustline: vi.fn(),
      connectWallet: vi.fn(),
    },
  };
});

vi.mock("@/hooks/useWalletStatus", () => ({
  useWalletStatus: () => walletStatus,
}));

vi.mock("@/lib/stellar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stellar")>("@/lib/stellar");
  return {
    ...actual,
    getWalletAssets: stellarMock.getWalletAssets,
    addTrustline: stellarMock.addTrustline,
    connectWallet: stellarMock.connectWallet,
  };
});

const XLM_ASSET = {
  code: "XLM",
  issuer: null,
  name: "Lumen",
  balance: "10.0000000",
  hasTrustline: true,
};

const USDC_ASSET = {
  code: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  name: "USDC",
  balance: "5.5000000",
  hasTrustline: true,
};

describe("WalletWidget", () => {
  afterEach(() => {
    vi.clearAllMocks();
    walletStatus.kind = "connected";
    walletStatus.address =
      "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXQK7A";
  });

  it("renders the fallback state when Freighter is unavailable", () => {
    walletStatus.kind = "unavailable";
    walletStatus.address = null;
    renderWidget(<WalletWidget />);
    expect(screen.getByText(/freighter wasn't detected/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /install freighter/i })).toHaveAttribute(
      "href",
      "https://freighter.app"
    );
  });

  it("offers a connect action when the wallet has not shared an account", async () => {
    walletStatus.kind = "disconnected";
    walletStatus.address = null;
    stellarMock.connectWallet.mockResolvedValue(
      "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXQK7A"
    );
    renderWidget(<WalletWidget />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));
    expect(await screen.findByText("Wallet connected")).toBeInTheDocument();
    expect(stellarMock.connectWallet).toHaveBeenCalledTimes(1);
  });

  it("populates real-time XLM and USDC balances after wallet authorization", async () => {
    stellarMock.getWalletAssets.mockResolvedValue([XLM_ASSET, USDC_ASSET]);
    renderWidget(<WalletWidget />);
    expect(await screen.findByText("10.00 XLM")).toBeInTheDocument();
    expect(screen.getByText("5.50 USDC")).toBeInTheDocument();
    expect(screen.getByText(/wallet ready for settlements/i)).toBeInTheDocument();
    expect(stellarMock.getWalletAssets).toHaveBeenCalledWith(walletStatus.address);
  });

  it("flags groups whose settlement asset the wallet cannot hold", async () => {
    stellarMock.getWalletAssets.mockResolvedValue([
      XLM_ASSET,
      { ...USDC_ASSET, hasTrustline: false },
    ]);
    renderWidget(
      <WalletWidget
        groups={[
          { id: "g1", name: "Trip to Lagos", netAssetCode: "USDC" },
          { id: "g2", name: "Rent Circle", netAssetCode: "XLM" },
        ]}
      />
    );
    expect(await screen.findByText(/usdc trustline required/i)).toBeInTheDocument();
    // Only the USDC-settling group is flagged — the XLM group is safe.
    expect(screen.getByText(/affected groups:/i)).toHaveTextContent(
      "Trip to Lagos"
    );
    expect(screen.getByText(/affected groups:/i)).not.toHaveTextContent(
      "Rent Circle"
    );
  });

  it("runs the Freighter signature flow and shows a success notification once confirmed on-chain", async () => {
    stellarMock.getWalletAssets
      .mockResolvedValueOnce([XLM_ASSET, { ...USDC_ASSET, hasTrustline: false }])
      .mockResolvedValue([XLM_ASSET, USDC_ASSET]);
    stellarMock.addTrustline.mockResolvedValue({
      txHash: "a".repeat(64),
    });
    renderWidget(<WalletWidget />);
    fireEvent.click(
      await screen.findByRole("button", { name: /setup trustline/i })
    );
    expect(
      await screen.findByText(/usdc trustline confirmed on-chain/i)
    ).toBeInTheDocument();
    expect(stellarMock.addTrustline).toHaveBeenCalledWith(
      walletStatus.address,
      "USDC",
      USDC_ASSET.issuer
    );
    // The warning card flips to the ready state after confirmation.
    await waitFor(() =>
      expect(
        screen.queryByText(/usdc trustline required/i)
      ).not.toBeInTheDocument()
    );
  });

  it("gracefully handles a rejected signature request without a success toast", async () => {
    stellarMock.getWalletAssets.mockResolvedValue([
      XLM_ASSET,
      { ...USDC_ASSET, hasTrustline: false },
    ]);
    stellarMock.addTrustline.mockRejectedValue(new UserRejectedError());
    renderWidget(<WalletWidget />);
    fireEvent.click(
      await screen.findByRole("button", { name: /setup trustline/i })
    );
    expect(
      await screen.findByText(/you cancelled the request/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/usdc trustline confirmed on-chain/i)
    ).not.toBeInTheDocument();
    // The warning stays visible so the user can retry.
    expect(screen.getByText(/usdc trustline required/i)).toBeInTheDocument();
  });

  it("surfaces a locked-wallet failure as a stable message", async () => {
    stellarMock.getWalletAssets.mockResolvedValue([
      XLM_ASSET,
      { ...USDC_ASSET, hasTrustline: false },
    ]);
    stellarMock.addTrustline.mockRejectedValue(new WalletLockedError());
    renderWidget(<WalletWidget />);
    fireEvent.click(
      await screen.findByRole("button", { name: /setup trustline/i })
    );
    expect(
      await screen.findByText(/your freighter wallet is locked/i)
    ).toBeInTheDocument();
  });
});
