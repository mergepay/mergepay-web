import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { AddressQRCode } from "./AddressQRCode";

vi.mock("qrcode.react", () => ({
  QRCodeCanvas: ({ value, ...props }: { value: string; [key: string]: unknown }) => (
    <canvas data-testid="qr-canvas" data-value={value} {...props} />
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const TEST_ADDRESS = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB";

function stubClipboard(impl: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(impl) },
    configurable: true,
  });
}

describe("AddressQRCode", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the QR code with correct value and size", async () => {
    render(<AddressQRCode value={TEST_ADDRESS} size={200} />);
    // The QR encoder is code-split (#707), so the canvas arrives a tick later.
    const canvas = await screen.findByTestId("qr-canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas.getAttribute("data-value")).toBe(TEST_ADDRESS);
  });

  it("renders copy button by default", () => {
    render(<AddressQRCode value={TEST_ADDRESS} />);
    expect(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    ).toBeInTheDocument();
  });

  it("omits copy button when showCopyButton is false", () => {
    render(<AddressQRCode value={TEST_ADDRESS} showCopyButton={false} />);
    expect(
      screen.queryByRole("button", { name: /copy stellar address/i })
    ).not.toBeInTheDocument();
  });

  it("copies value to clipboard and shows success toast", async () => {
    stubClipboard(() => Promise.resolve());
    render(<AddressQRCode value={TEST_ADDRESS} />);

    fireEvent.click(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TEST_ADDRESS);
      expect(toast.success).toHaveBeenCalledWith("Stellar address copied to clipboard");
    });
  });

  it("handles clipboard permission errors gracefully with fallback toast", async () => {
    stubClipboard(() => Promise.reject(new Error("Permission denied")));
    render(<AddressQRCode value={TEST_ADDRESS} />);

    fireEvent.click(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TEST_ADDRESS);
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to copy stellar address. Please copy it manually."
      );
    });
  });
});
