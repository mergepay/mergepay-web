import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettlementConfirmation } from "./settlement-confirmation";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

const defaultProps = {
  toDisplayName: "Taylor",
  amount: "10",
  assetCode: "XLM",
  assetIssuer: null as string | null,
};

describe("SettlementConfirmation", () => {
  it("displays the configured Stellar network", () => {
    render(<SettlementConfirmation {...defaultProps} />);
    expect(screen.getByText(/Stellar network/i)).toBeInTheDocument();
    expect(screen.getByText(/Stellar (Testnet|Mainnet)/i)).toBeInTheDocument();
  });

  it("displays the settlement asset badge", () => {
    render(<SettlementConfirmation {...defaultProps} />);
    expect(screen.getByText("XLM")).toBeInTheDocument();
    expect(screen.getByText(/Settlement asset/i)).toBeInTheDocument();
  });

  it("displays USDC asset with issuer hint", () => {
    render(
      <SettlementConfirmation
        {...defaultProps}
        assetCode="USDC"
        assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
      />
    );
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText(/Issuer:/)).toBeInTheDocument();
  });

  it("displays the recipient name", () => {
    render(<SettlementConfirmation {...defaultProps} />);
    expect(screen.getByText("Taylor")).toBeInTheDocument();
    expect(screen.getByText(/Paying/i)).toBeInTheDocument();
  });

  it("displays the amount", () => {
    render(<SettlementConfirmation {...defaultProps} />);
    expect(screen.getAllByText("10.00 XLM").length).toBeGreaterThan(0);
  });

  it("shows security notice about keys never leaving wallet", () => {
    render(<SettlementConfirmation {...defaultProps} />);
    expect(
      screen.getByText(/keys never leave your wallet/i)
    ).toBeInTheDocument();
  });

  it("shows network mismatch warning when passphrase does not match", () => {
    // CONFIGURED_NETWORK defaults to "public" in the test environment
    // (NEXT_PUBLIC_STELLAR_NETWORK is unset). Pass a testnet passphrase
    // to simulate a mismatch.
    render(
      <SettlementConfirmation
        {...defaultProps}
        intentNetworkPassphrase={TESTNET_PASSPHRASE}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Network mismatch/i)).toBeInTheDocument();
  });

  it("does not show network mismatch when passphrase matches", () => {
    // CONFIGURED_NETWORK defaults to "public", so the mainnet passphrase
    // is the matching one.
    render(
      <SettlementConfirmation
        {...defaultProps}
        intentNetworkPassphrase={MAINNET_PASSPHRASE}
      />
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show network mismatch when passphrase is null", () => {
    render(
      <SettlementConfirmation
        {...defaultProps}
        intentNetworkPassphrase={null}
      />
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show network mismatch when passphrase is undefined", () => {
    render(
      <SettlementConfirmation {...defaultProps} intentNetworkPassphrase={undefined} />
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has proper accessibility attributes for network context", () => {
    render(<SettlementConfirmation {...defaultProps} />);
    const networkStatus = screen.getByRole("status", {
      name: /Stellar Mainnet/i,
    });
    expect(networkStatus).toBeInTheDocument();
  });
});
