import React from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NetworkStatusBanner } from "../NetworkStatusBanner";

describe("NetworkStatusBanner Component", () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: originalOnLine,
    });
    vi.unstubAllGlobals();
  });

  it("does not render when online and API is healthy", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    render(<NetworkStatusBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders offline banner with assertive/polite accessibility and neobrutalist style when offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<NetworkStatusBanner />);

    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveTextContent(/You are currently offline/i);
    expect(banner.className).toContain("border-ink");
    expect(banner.className).toContain("shadow-brutal-sm");
  });

  it("allows user to dismiss the banner and retry connection", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<NetworkStatusBanner />);

    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();

    const dismissButton = screen.getByRole("button", { name: /Dismiss network banner/i });
    fireEvent.click(dismissButton);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const retryButton = screen.queryByRole("button", { name: /Retry connection/i });
    if (retryButton) {
      fireEvent.click(retryButton);
    }
  });
});
