import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function CrashingWidget({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Simulated widget crash");
  }
  return <div>Widget healthy</div>;
}

describe("ErrorBoundary fallback UI and reset recovery (#613)", () => {
  it("renders custom fallback function and invokes onReset when triggered", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();

    render(
      <ErrorBoundary
        onReset={onReset}
        fallback={(err, reset) => (
          <div>
            <span>Fallback: {err.message}</span>
            <button type="button" onClick={reset}>
              Retry Widget
            </button>
          </div>
        )}
      >
        <CrashingWidget shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Fallback: Simulated widget crash")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Widget" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
