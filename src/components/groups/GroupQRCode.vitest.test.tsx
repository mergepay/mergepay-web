import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { forwardRef } from "react";
import { toast } from "sonner";
import { GroupQRCode } from "./GroupQRCode";

vi.mock("@/components/ui/lazy-qr-code", () => ({
  QRCodeSVG: Object.assign(
    forwardRef(({ value, ...props }: { value: string; [key: string]: unknown }, ref: any) => (
      <svg ref={ref} data-testid="qr-svg" data-value={value} {...props} />
    )),
    { displayName: "QRCodeSVG" }
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const writeText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText },
  configurable: true,
});

describe("GroupQRCode", () => {
  const testUrl = "https://mergepay.app/join/TESTCODE";

  it("renders the QR code component with the invite URL and neobrutalist styling", () => {
    render(<GroupQRCode inviteUrl={testUrl} />);
    
    expect(screen.getByText(/quick group invite/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/invite link/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe(testUrl);
    expect(screen.getByTestId("qr-svg")).toHaveAttribute("data-value", testUrl);
  });

  it("copies invite link to clipboard and shows sonner toast", async () => {
    render(<GroupQRCode inviteUrl={testUrl} />);
    const copyButton = screen.getByRole("button", { name: /copy/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(testUrl);
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
