import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupQRCode } from "./GroupQRCode";

describe("GroupQRCode", () => {
  const testUrl = "https://mergepay.app/join/TESTCODE";

  it("renders the QR code component with the invite URL", () => {
    render(<GroupQRCode inviteUrl={testUrl} />);
    
    expect(screen.getByText(/quick group invite/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/invite link/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe(testUrl);
  });
});
