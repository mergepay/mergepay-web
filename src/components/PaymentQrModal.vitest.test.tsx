import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentQrModal } from "./PaymentQrModal";
import * as clipboard from "@/lib/clipboard";

const VALID_ADDRESS = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB";

vi.mock("qrcode.react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("qrcode.react")>();
  return {
    ...actual,
    QRCodeCanvas: ({ value }: { value: string }) => (
      <canvas data-testid="qr-canvas" data-value={value} />
    ),
    QRCodeSVG: ({ value }: { value: string }) => (
      <svg data-testid="qr-svg" data-value={value} />
    ),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(true),
}));

describe("PaymentQrModal Component (#721)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders QR code modal using Dialog primitive with title and description", async () => {
    render(
      <PaymentQrModal
        open={true}
        onClose={vi.fn()}
        stellarAddress={VALID_ADDRESS}
        title="Receive Stellar Payment"
        description="Scan this QR code with a Stellar wallet"
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Receive Stellar Payment")).toBeInTheDocument();
    expect(
      screen.getByText("Scan this QR code with a Stellar wallet")
    ).toBeInTheDocument();
  });

  it("generates valid QR code graphic from Stellar public key string (#721)", async () => {
    render(
      <PaymentQrModal
        open={true}
        onClose={vi.fn()}
        stellarAddress={VALID_ADDRESS}
      />
    );

    const canvas = await screen.findByTestId("qr-canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas.getAttribute("data-value")).toBe(VALID_ADDRESS);
    expect(screen.getByText(VALID_ADDRESS)).toBeInTheDocument();
  });

  it("generates valid QR code graphic from split expense payment URI (#721)", async () => {
    render(
      <PaymentQrModal
        open={true}
        onClose={vi.fn()}
        stellarAddress={VALID_ADDRESS}
        amount="25.50"
        assetCode="USDC"
        assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
        memo="DinnerSplit"
      />
    );

    const canvas = await screen.findByTestId("qr-canvas");
    const val = canvas.getAttribute("data-value") || "";
    expect(val).toContain("web+stellar:pay");
    expect(val).toContain(`destination=${VALID_ADDRESS}`);
    expect(val).toContain("amount=25.50");
    expect(val).toContain("asset_code=USDC");
    expect(val).toContain("memo=DinnerSplit");

    expect(screen.getByText("Requested Amount:")).toBeInTheDocument();
    expect(screen.getByText("25.50 USDC")).toBeInTheDocument();
  });

  it("includes close button and keyboard escape key support (#721)", async () => {
    const onClose = vi.fn();
    render(
      <PaymentQrModal
        open={true}
        onClose={onClose}
        stellarAddress={VALID_ADDRESS}
        title="Close Test"
      />
    );

    // Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    // Close button
    const closeBtn = screen.getByRole("button", { name: "Close Close Test" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("copies payment QR payload to clipboard when copy button is clicked (#721)", async () => {
    render(
      <PaymentQrModal
        open={true}
        onClose={vi.fn()}
        stellarAddress={VALID_ADDRESS}
      />
    );

    const copyBtn = await screen.findByRole("button", {
      name: /copy payment request/i,
    });
    expect(copyBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(clipboard.copyTextToClipboard).toHaveBeenCalledWith(VALID_ADDRESS);
  });

  it("renders an accessible alert fallback when no address or payment URI is provided (#721)", () => {
    render(
      <PaymentQrModal
        open={true}
        onClose={vi.fn()}
        stellarAddress={null}
        paymentUri={null}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      screen.getByText(/no valid stellar address or payment uri provided/i)
    ).toBeInTheDocument();
  });

  it("verified responsive on mobile screen sizes with fluid dialog constraints (#721)", () => {
    render(
      <PaymentQrModal
        open={true}
        onClose={vi.fn()}
        stellarAddress={VALID_ADDRESS}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("sm:max-w-md");
    expect(dialog.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(screen.getByTestId("qr-container")).toHaveClass("max-w-[260px]");
  });
});
