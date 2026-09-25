import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiveQrModal, parseScannedPayload } from "./ReceiveQrModal";

// Valid checksummed ed25519 public key (verified against the production
// StrKey validator in src/lib/strkey.ts, so the scan flow is exercised
// against the real rules).
const VALID_ADDRESS = "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB";

// qrcode.react renders the encoded payload into canvas paths, not DOM
// attributes. Stub it with an element that exposes the value so tests can
// assert exactly what would be encoded.
vi.mock("qrcode.react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("qrcode.react")>();
  return {
    ...actual,
    QRCodeSVG: ({ value }: { value: string }) => (
      <svg data-testid="qr-code" data-value={value} />
    ),
  };
});

// Spy on sonner toasts while keeping the module surface intact. The factory
// is hoisted, so the spies must be created inside vi.hoisted.
const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
  Toaster: () => null,
}));

function renderModal(props: Partial<Parameters<typeof ReceiveQrModal>[0]> = {}) {
  return render(
    <ReceiveQrModal
      open
      onClose={vi.fn()}
      stellarPublicKey={VALID_ADDRESS}
      {...props}
    />
  );
}

function stubClipboard(impl: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(impl) },
    configurable: true,
  });
}

describe("ReceiveQrModal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the QR code encoding the full public key without truncation", () => {
    renderModal();
    expect(screen.getByText(/receive money/i)).toBeInTheDocument();

    const qr = screen.getByTestId("qr-code");
    expect(qr.getAttribute("data-value")).toBe(VALID_ADDRESS);
  });

  it("shows the copy button with an accessible label", () => {
    renderModal();
    expect(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    ).toBeInTheDocument();
  });

  it("copies the full address, flips to the copied state, and fires a success toast", async () => {
    stubClipboard(() => Promise.resolve());
    renderModal();

    fireEvent.click(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(VALID_ADDRESS);
      expect(
        screen.getByRole("button", { name: /stellar address copied/i })
      ).toBeInTheDocument();
      expect(toastSuccess).toHaveBeenCalledWith("Stellar address copied");
    });
  });

  it("surfaces an error toast instead of a fake copied state when the clipboard fails", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    renderModal();

    fireEvent.click(
      screen.getByRole("button", { name: /copy stellar address to clipboard/i })
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(VALID_ADDRESS);
      expect(toastError).toHaveBeenCalled();
    });
    // The button must never claim success.
    expect(
      screen.queryByRole("button", { name: /stellar address copied/i })
    ).not.toBeInTheDocument();
  });

  it("encodes an optional transaction URI instead of the address", () => {
    const uri = "web+stellar:pay?destination=GABC&amount=10&memo=hi";
    renderModal({ transactionUri: uri });

    expect(screen.getByTestId("qr-code").getAttribute("data-value")).toBe(uri);
    expect(screen.getByLabelText(/transaction uri/i)).toBeInTheDocument();
  });

  it("switches to scan mode, validates a scanned address, and copies it", async () => {
    stubClipboard(() => Promise.resolve());
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /^scan$/i }));
    fireEvent.change(screen.getByLabelText(/scanned qr payload/i), {
      target: { value: `  ${VALID_ADDRESS}  ` },
    });
    fireEvent.click(screen.getByRole("button", { name: /validate payload/i }));

    expect(await screen.findByText(/validated stellar address/i)).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Valid Stellar address detected");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /copy scanned stellar address to clipboard/i })
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(VALID_ADDRESS);
      expect(toastSuccess).toHaveBeenCalledWith("Scanned address copied");
    });
  });

  it("rejects an invalid scanned payload with an error message and toast", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /^scan$/i }));
    fireEvent.change(screen.getByLabelText(/scanned qr payload/i), {
      target: { value: "not-a-stellar-thing" },
    });
    fireEvent.click(screen.getByRole("button", { name: /validate payload/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not a valid stellar address or payment uri/i
    );
    expect(toastError).toHaveBeenCalled();
    // No copy target is offered for invalid payloads.
    expect(
      screen.queryByRole("button", { name: /copy scanned/i })
    ).not.toBeInTheDocument();
  });
});

describe("parseScannedPayload", () => {
  it("accepts a valid ed25519 public key", () => {
    const parsed = parseScannedPayload(VALID_ADDRESS);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.kind).toBe("address");
  });

  it("accepts a payment URI", () => {
    const parsed = parseScannedPayload("web+stellar:pay?destination=GABC&amount=10");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.kind).toBe("uri");
  });

  it("rejects garbage", () => {
    expect(parseScannedPayload("").ok).toBe(false);
    expect(parseScannedPayload("GABC").ok).toBe(false);
    expect(parseScannedPayload("hello world").ok).toBe(false);
  });
});
