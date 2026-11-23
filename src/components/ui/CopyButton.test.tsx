import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CopyButton from "./CopyButton";

describe("CopyButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders copy button with default text", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CopyButton text="test-hash" what="transaction hash" />);
    const button = screen.getByRole("button", { name: /copy transaction hash/i });
    expect(button).toBeInTheDocument();
  });

  it("copies text to clipboard and shows copied feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CopyButton text="test-hash" what="transaction hash" />);
    const button = screen.getByRole("button");
    
    fireEvent.click(button);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("test-hash");
    });

    expect(await screen.findByRole("status")).toHaveTextContent("transaction hash copied to clipboard");
  });
});
