import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

describe("OfflineBanner network status detection (#622)", () => {
  it("stays hidden when online and renders accessible status alert when offline", () => {
    Object.defineProperty(window.navigator, "onLine", {
      writable: true,
      value: true,
    });

    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      Object.defineProperty(window.navigator, "onLine", {
        writable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));
    });

    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner.textContent).toMatch(/offline/i);
  });
});
