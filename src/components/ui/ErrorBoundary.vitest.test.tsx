import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error(
      "Boom! Component exploded during render"
    );
  }
  return <div>Everything is fine</div>;
}

describe("ErrorBoundary", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Everything is fine")).toBeInTheDocument();
  });

  it("catches error and displays neobrutalist fallback UI", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Boom! Component exploded during render/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("offers a Return to Dashboard navigation link (#479)", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    const link = screen.getByRole("link", { name: /return to dashboard/i });
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("points the dashboard link at a custom href when provided", () => {
    render(
      <ErrorBoundary dashboardHref="/settings">
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole("link", { name: /return to dashboard/i })).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  it("resets error state when Try Again button is clicked", () => {
    let throwError = true;

    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={throwError} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Re-render with safe children first, then reset the boundary so the
    // remounted subtree renders normally instead of throwing again.
    throwError = false;
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={throwError} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Everything is fine")).toBeInTheDocument();
  });

  /** Lines our boundary logged, ignoring React's own dev-mode noise. */
  function mergepayLines() {
    return (errorLog.mock.calls as unknown[][]).filter(
      ([head]) => typeof head === "string" && head.startsWith("[mergepay]")
    );
  }

  it("logs one structured line with the component stack while developing (#527)", () => {
    errorLog.mockClear();
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    const lines = mergepayLines();
    expect(lines).toHaveLength(1);
    expect(lines[0][0]).toBe("[mergepay] render error");
    expect(lines[0][1]).toEqual(
      expect.objectContaining({
        name: "Error",
        message: "Boom! Component exploded during render",
      })
    );
    expect(lines[0][1]).toHaveProperty("componentStack");
  });

  it("logs nothing and shows no internals in production (#527)", () => {
    errorLog.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    try {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      );

      // Recovery UI still appears…
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      // …without the raw message, and without a console breadcrumb that could
      // leak wallet or account state out of a user's browser.
      expect(screen.queryByText(/Boom! Component exploded/)).not.toBeInTheDocument();
      // React's own dev-mode notice may still print; our logger must not.
      expect(mergepayLines()).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
