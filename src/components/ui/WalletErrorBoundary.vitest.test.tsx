import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WalletErrorBoundary, WalletErrorFallback } from "./WalletErrorBoundary";

function FailingWalletComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("User declined the signing request in Freighter");
  }
  return <div>Wallet connected successfully</div>;
}

describe("WalletErrorBoundary (#700)", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no wallet error occurs", () => {
    render(
      <WalletErrorBoundary>
        <FailingWalletComponent shouldThrow={false} />
      </WalletErrorBoundary>
    );
    expect(screen.getByText("Wallet connected successfully")).toBeInTheDocument();
  });

  it("catches wallet failure and renders neobrutalist fallback UI", () => {
    render(
      <WalletErrorBoundary>
        <FailingWalletComponent shouldThrow={true} />
      </WalletErrorBoundary>
    );

    expect(screen.getByText("Wallet Connection Failed")).toBeInTheDocument();
    expect(screen.getByText(/User declined the signing request/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect wallet/i })).toBeInTheDocument();
  });

  it("calls onReset callback when reconnect button is clicked", () => {
    const handleReset = vi.fn();
    render(
      <WalletErrorFallback
        error={new Error("Freighter not found")}
        onRetry={handleReset}
      />
    );

    expect(screen.getByText("Freighter extension was not detected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reconnect wallet/i }));
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
