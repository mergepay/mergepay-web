import { describe, it, beforeEach, vi, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { NetworkStatusComponent } from "../../components/network-status";

describe("NetworkStatusComponent & network detection (#ISSUE)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  it("renders offline banner when browser goes offline", async () => {
    render(<NetworkStatusComponent />);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(await screen.findByText(/You are offline/i)).toBeInTheDocument();
  });

  it("renders API degraded banner when health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    render(<NetworkStatusComponent />);

    // Allow polling / initial health check effect to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(await screen.findByText(/Network latency detected/i)).toBeInTheDocument();
  });
});
