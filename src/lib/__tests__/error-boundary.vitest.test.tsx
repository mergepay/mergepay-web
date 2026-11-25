import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function SettlementCrashingChild({ shouldCrash }: { shouldCrash: boolean }) {
  if (shouldCrash) {
    throw new Error("Freighter wallet disconnected mid-flow during settlement");
  }
  return <div data-testid="settlement-success">Settlement Ready for Signing</div>;
}

describe("Settlement & Transaction ErrorBoundary (#724)", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders settlement children normally when no exception occurs", () => {
    render(
      <ErrorBoundary>
        <SettlementCrashingChild shouldCrash={false} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("settlement-success")).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it("catches render exception in settlement flows and shows neobrutalist fallback UI", () => {
    render(
      <ErrorBoundary>
        <SettlementCrashingChild shouldCrash={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/Freighter wallet disconnected mid-flow during settlement/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /return to dashboard/i })
    ).toHaveAttribute("href", "/dashboard");
  });

  it("invokes onReset handler and recovers when Try Again is clicked", () => {
    const onReset = vi.fn();

    function TestHost() {
      const [crash, setCrash] = useState(true);
      return (
        <ErrorBoundary
          onReset={() => {
            onReset();
            setCrash(false);
          }}
        >
          <SettlementCrashingChild shouldCrash={crash} />
        </ErrorBoundary>
      );
    }

    render(<TestHost />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(tryAgainBtn);

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("settlement-success")).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it("calls onError callback when a child crashes", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <SettlementCrashingChild shouldCrash={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe(
      "Freighter wallet disconnected mid-flow during settlement"
    );
  });

  it("supports custom dashboardHref escape hatch", () => {
    render(
      <ErrorBoundary dashboardHref="/groups/group-123">
        <SettlementCrashingChild shouldCrash={true} />
      </ErrorBoundary>
    );

    const escapeLink = screen.getByRole("link", { name: /return to dashboard/i });
    expect(escapeLink).toHaveAttribute("href", "/groups/group-123");
  });
});
