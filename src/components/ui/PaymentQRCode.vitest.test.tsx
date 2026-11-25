import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentQRCode, buildStellarPaymentUri } from "./PaymentQRCode";

describe("buildStellarPaymentUri", () => {
  it("generates a valid SEP-0007 URI with destination and amount", () => {
    const uri = buildStellarPaymentUri({
      address: "GBJGVUTHOY2J32N4CVMZ3I55P5WGB2K2B2SXY7N65WJ7WOBQJ63H2W2A",
      amount: "25.50",
    });
    expect(uri).toBe(
      "web+stellar:pay?destination=GBJGVUTHOY2J32N4CVMZ3I55P5WGB2K2B2SXY7N65WJ7WOBQJ63H2W2A&amount=25.50"
    );
  });

  it("includes memo and memo_type when memo is provided", () => {
    const uri = buildStellarPaymentUri({
      address: "GBJGVUTHOY2J32N4CVMZ3I55P5WGB2K2B2SXY7N65WJ7WOBQJ63H2W2A",
      amount: "10",
      memo: "MP:dinner-split",
    });
    expect(uri).toContain("memo=MP%3Adinner-split");
    expect(uri).toContain("memo_type=MEMO_TEXT");
  });

  it("includes asset_code and asset_issuer when non-native asset is provided", () => {
    const uri = buildStellarPaymentUri({
      address: "GBJGVUTHOY2J32N4CVMZ3I55P5WGB2K2B2SXY7N65WJ7WOBQJ63H2W2A",
      amount: "100",
      assetCode: "USDC",
      assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    });
    expect(uri).toContain("asset_code=USDC");
    expect(uri).toContain(
      "asset_issuer=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    );
  });

  it("does not include asset_code when asset is XLM", () => {
    const uri = buildStellarPaymentUri({
      address: "GBJGVUTHOY2J32N4CVMZ3I55P5WGB2K2B2SXY7N65WJ7WOBQJ63H2W2A",
      amount: "10",
      assetCode: "XLM",
    });
    expect(uri).not.toContain("asset_code");
  });

  it("returns raw address if it already starts with web+stellar:", () => {
    const customUri = "web+stellar:pay?destination=GABC&amount=5";
    expect(buildStellarPaymentUri({ address: customUri })).toBe(customUri);
  });
});

describe("PaymentQRCode Component", () => {
  const defaultAddress = "GBJGVUTHOY2J32N4CVMZ3I55P5WGB2K2B2SXY7N65WJ7WOBQJ63H2W2A";
  const defaultAmount = "50";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders QR code container with high-contrast neobrutalist borders", () => {
    render(
      <PaymentQRCode
        address={defaultAddress}
        amount={defaultAmount}
        memo="MP:group-123"
      />
    );

    const container = screen.getByTestId("payment-qr-container");
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass("border-3");
    expect(container).toHaveClass("border-ink");
    expect(container).toHaveClass("shadow-brutal");

    // QR Code SVG should be rendered
    const svg = screen.getByLabelText("Stellar payment request");
    expect(svg).toBeInTheDocument();
  });

  it("renders fallback state when address is missing", () => {
    render(<PaymentQRCode address={null} amount="50" />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      screen.getByText(/Recipient Stellar public key is required/i)
    ).toBeInTheDocument();
  });

  it("renders fallback state when amount is missing or invalid", () => {
    render(<PaymentQRCode address={defaultAddress} amount="" />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      screen.getByText(/A valid payment amount is required/i)
    ).toBeInTheDocument();
  });

  it("renders fallback state when both address and amount are missing", () => {
    render(<PaymentQRCode address={null} amount={null} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      screen.getByText(
        /Recipient Stellar address and payment amount are required/i
      )
    ).toBeInTheDocument();
  });

  it("displays custom fallbackMessage when provided and details are missing", () => {
    render(
      <PaymentQRCode
        address={null}
        amount={null}
        fallbackMessage="Custom missing details notice"
      />
    );

    expect(
      screen.getByText("Custom missing details notice")
    ).toBeInTheDocument();
  });

  it("handles copy URI button click and shows confirmation feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <PaymentQRCode
        address={defaultAddress}
        amount={defaultAmount}
        memo="MP:test-memo"
      />
    );

    const copyBtn = screen.getByRole("button", {
      name: /copy payment uri to clipboard/i,
    });
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("web+stellar:pay?destination=")
      );
    });

    expect(screen.getByText(/Copied URI/i)).toBeInTheDocument();
  });
});
