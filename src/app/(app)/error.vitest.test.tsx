import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AppError from "./error";

describe("Authenticated route error fallback (#627)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("renders recovery actions in a neobrutalist alert", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<AppError error={new Error("Render crashed")} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveClass("border-3", "bg-flamingo-pale");
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not reveal private error messages in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = Object.assign(new Error("private account details"), { digest: "safe-reference-123" });
    render(<AppError error={error} reset={vi.fn()} />);
    expect(screen.queryByText(/private account details/i)).not.toBeInTheDocument();
    expect(screen.getByText(/safe-reference-123/)).toBeInTheDocument();
  });
});
