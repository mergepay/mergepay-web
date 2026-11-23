import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletQrModal } from "./WalletQrModal";

describe("WalletQrModal", () => {
  const testAddress = "GABCD123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  it("renders when open is true", () => {
    render(
      <WalletQrModal
        open={true}
        onClose={() => {}}
        address={testAddress}
      />
    );

    expect(screen.getByText(/Share Wallet Address/i)).toBeDefined();
    expect(screen.getByText(testAddress)).toBeDefined();
  });

  it("does not render when open is false", () => {
    render(
      <WalletQrModal
        open={false}
        onClose={() => {}}
        address={testAddress}
      />
    );

    expect(screen.queryByText(/Share Wallet Address/i)).toBeNull();
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <WalletQrModal
        open={true}
        onClose={handleClose}
        address={testAddress}
      />
    );

    const closeButton = screen.getByRole("button", { name: /Close Share Wallet Address/i });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("includes a copy button for the address", () => {
    render(
      <WalletQrModal
        open={true}
        onClose={() => {}}
        address={testAddress}
      />
    );

    const copyButton = screen.getByRole("button", { name: /Copy wallet address/i });
    expect(copyButton).toBeDefined();
  });
});
