import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkStatusBanner } from "../NetworkStatusBanner";

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
};

const dispatchConnection = (event: "online" | "offline", online: boolean) => {
  setOnline(online);
  act(() => window.dispatchEvent(new Event(event)));
};

describe("NetworkStatusBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setOnline(true);
  });

  it("stays hidden while online", () => {
    render(<NetworkStatusBanner />);
    expect(screen.queryByTestId("network-status-banner")).not.toBeInTheDocument();
  });

  it("detects an offline browser at mount", () => {
    setOnline(false);
    render(<NetworkStatusBanner />);
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("shows offline status and automatically clears the reconnection message", () => {
    render(<NetworkStatusBanner />);
    dispatchConnection("offline", false);
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.getByText(/before submitting or retrying transactions/i)).toBeInTheDocument();

    dispatchConnection("online", true);
    expect(screen.getByText("Connection restored")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByTestId("network-status-banner")).not.toBeInTheDocument();
  });

  it("cancels the reconnection timeout when connectivity drops again", () => {
    render(<NetworkStatusBanner />);
    dispatchConnection("offline", false);
    dispatchConnection("online", true);
    act(() => vi.advanceTimersByTime(2000));
    dispatchConnection("offline", false);
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });

  it("removes event listeners when unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<NetworkStatusBanner />);
    unmount();
    expect(remove).toHaveBeenCalledWith("offline", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("online", expect.any(Function));
    remove.mockRestore();
  });
});
