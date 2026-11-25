import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GlobalError from "./global-error";

/** Next hands the boundary a serialised error plus the server-side digest. */
function errorFixture() {
  const error = new Error("Minimum missing funds: created by signing") as Error & {
    digest?: string;
  };
  error.digest = "abc123def456";
  return error;
}

/** Replace `window.location` with a spy-able copy; restore it afterwards. */
function stubLocation() {
  const original = window.location;
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...original, reload },
  });
  return { reload, restore: () => Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: original,
  }) };
}

describe("GlobalError (#527)", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders the neobrutalist fallback instead of a blank document", () => {
    const { container } = render(<GlobalError error={errorFixture()} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Mergepay hit an error/i)).toBeInTheDocument();
    // The boundary owns the whole document, so it must supply the shell.
    expect(container.querySelector("html")).toBeTruthy();
    expect(container.querySelector("body")).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to start/i })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("reloads the document when the retry button is used", () => {
    const { reload, restore } = stubLocation();
    render(<GlobalError error={errorFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: /reload/i }));

    expect(reload).toHaveBeenCalledTimes(1);
    restore();
  });

  it("shows the error message and logs it while developing", () => {
    render(<GlobalError error={errorFixture()} />);

    expect(screen.getByText(/Minimum missing funds/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(
      "[mergepay] render error",
      expect.objectContaining({ message: "Minimum missing funds: created by signing" })
    );
  });

  it("hides the message and logs nothing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<GlobalError error={errorFixture()} />);

    expect(screen.queryByText(/Minimum missing funds/)).not.toBeInTheDocument();
    // The digest is the only handle a support reply can work from.
    expect(screen.getByText(/abc123def456/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
