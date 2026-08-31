import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletErrorBoundary } from "./WalletErrorBoundary";
import { WalletNotInstalledError, WalletLockedError, UserRejectedError } from "@/lib/stellar";

function Bomb({ error }: { error: Error }) {
  throw error;
}

describe("WalletErrorBoundary", () => {
  // Suppress console.error in tests for expected thrown errors
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it("renders children normally when no error occurs", () => {
    render(
      <WalletErrorBoundary>
        <div>All systems operational</div>
      </WalletErrorBoundary>
    );
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
  });

  it("renders Freighter not installed fallback card correctly", () => {
    render(
      <WalletErrorBoundary>
        <Bomb error={new WalletNotInstalledError()} />
      </WalletErrorBoundary>
    );
    expect(screen.getByText("Freighter Not Detected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /install freighter/i })).toHaveAttribute(
      "href",
      "https://freighter.app"
    );
  });

  it("renders wallet locked fallback card with Try Again action", () => {
    render(
      <WalletErrorBoundary>
        <Bomb error={new WalletLockedError()} />
      </WalletErrorBoundary>
    );
    expect(screen.getByText("Wallet Locked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders user rejected cancellation fallback correctly", () => {
    render(
      <WalletErrorBoundary>
        <Bomb error={new UserRejectedError()} />
      </WalletErrorBoundary>
    );
    expect(screen.getByText("Request Cancelled")).toBeInTheDocument();
  });
});
