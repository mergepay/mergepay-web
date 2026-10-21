import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupErrorBoundary } from "./GroupErrorBoundary";

function GroupBomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error(
      "Stellar RPC disruption or trustline error during group settlement hydration"
    );
  }
  return <div>Group settlement view loaded successfully</div>;
}

describe("GroupErrorBoundary", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children normally when no error occurs", () => {
    render(
      <GroupErrorBoundary>
        <GroupBomb shouldThrow={false} />
      </GroupErrorBoundary>
    );
    expect(screen.getByText("Group settlement view loaded successfully")).toBeInTheDocument();
  });

  it("catches error and displays neobrutalist group fallback UI with retry button", () => {
    render(
      <GroupErrorBoundary>
        <GroupBomb shouldThrow={true} />
      </GroupErrorBoundary>
    );

    expect(screen.getByText("Group Data Hydration Error")).toBeInTheDocument();
    expect(screen.getByText(/Stellar RPC disruption or trustline error/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("resets error state when Try Again button is clicked", () => {
    let throwError = true;

    const { rerender } = render(
      <GroupErrorBoundary>
        <GroupBomb shouldThrow={throwError} />
      </GroupErrorBoundary>
    );

    expect(screen.getByText("Group Data Hydration Error")).toBeInTheDocument();

    throwError = false;
    rerender(
      <GroupErrorBoundary>
        <GroupBomb shouldThrow={throwError} />
      </GroupErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Group settlement view loaded successfully")).toBeInTheDocument();
  });
});
