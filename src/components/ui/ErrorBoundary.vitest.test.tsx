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
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
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
});
