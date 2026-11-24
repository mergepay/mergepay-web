import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { OfflineBanner } from "./offline-banner";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("OfflineBanner Component (Issue #622)", () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: originalOnLine,
    });
  });

  it("does not render when navigator.onLine is true", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("renders offline banner when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<OfflineBanner />);

    const banner = screen.getByTestId("offline-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent(/You are currently offline/i);
    expect(banner).toHaveTextContent(/Stellar transactions and balance syncing are paused/i);
  });

  it("dynamically shows banner on 'offline' event and hides on 'online' event", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });

    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();

    // Trigger offline event
    act(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();

    // Trigger online event
    act(() => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("Connection restored");
  });

  it("includes neobrutalist styling classes", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<OfflineBanner />);
    const banner = screen.getByTestId("offline-banner");

    expect(banner.className).toContain("border-ink");
    expect(banner.className).toContain("bg-flamingo");
    expect(banner.className).toContain("shadow-brutal-sm");
  });
});
