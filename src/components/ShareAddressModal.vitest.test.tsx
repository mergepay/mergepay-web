import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareAddressModal } from "./ShareAddressModal";

// Valid checksummed ed25519 public key (verified against the production
// StrKey validator in src/lib/strkey.ts).
const VALID_ADDRESS = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB";

// qrcode.react draws the encoded payload into a canvas rather than exposing it
// as a DOM attribute. Stub it with an element that surfaces the value so tests
// can assert exactly what would be encoded.
vi.mock("qrcode.react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("qrcode.react")>();
  return {
    ...actual,
    QRCodeCanvas: ({ value }: { value: string }) => (
      <canvas data-testid="qr-canvas" data-value={value} />
    ),
  };
});

// Spy on sonner toasts while keeping the module surface intact. The factory is
// hoisted, so the spies must be created inside vi.hoisted.
const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
  Toaster: () => null,
}));

function stubClipboard(impl: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(impl) },
    configurable: true,
  });
}

describe("ShareAddressModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the QR code encoding the full Stellar public key", async () => {
    render(
      <ShareAddressModal open onClose={vi.fn()} stellarPublicKey={VALID_ADDRESS} />
    );

    expect(screen.getByText(/share your address/i)).toBeInTheDocument();
    // The full 56-character key is encoded, even though the readout below the
    // QR is truncated for display.
    // The QR encoder is code-split (#707), so the canvas arrives a tick later.
    expect((await screen.findByTestId("qr-canvas")).getAttribute("data-value")).toBe(
      VALID_ADDRESS
    );
  });

  it("shows the copy button with an accessible label", () => {
    render(
      <ShareAddressModal open onClose={vi.fn()} stellarPublicKey={VALID_ADDRESS} />
    );

    expect(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    ).toBeInTheDocument();
  });

  it("copies the address and confirms with a success toast", async () => {
    stubClipboard(() => Promise.resolve());
    render(
      <ShareAddressModal open onClose={vi.fn()} stellarPublicKey={VALID_ADDRESS} />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(VALID_ADDRESS);
      expect(toastSuccess).toHaveBeenCalledWith(
        "Stellar address copied to clipboard"
      );
    });
  });

  it("surfaces an error toast instead of a fake copied state when the clipboard fails", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(
      <ShareAddressModal open onClose={vi.fn()} stellarPublicKey={VALID_ADDRESS} />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to copy address");
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(
      <ShareAddressModal
        open={false}
        onClose={vi.fn()}
        stellarPublicKey={VALID_ADDRESS}
      />
    );

    expect(screen.queryByText(/share your address/i)).not.toBeInTheDocument();
  });
});
