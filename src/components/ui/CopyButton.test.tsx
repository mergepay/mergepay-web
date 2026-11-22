import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CopyButton from "./CopyButton";

describe("CopyButton", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  it("renders copy button with default text", () => {
    render(<CopyButton text="test-hash" what="transaction hash" />);
    const button = screen.getByRole("button", { name: /copy transaction hash/i });
    expect(button).toBeInTheDocument();
  });

  it("copies text to clipboard and shows copied feedback", async () => {
    render(<CopyButton text="test-hash" what="transaction hash" />);
    const button = screen.getByRole("button");
    
    fireEvent.click(button);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test-hash");
    });

    expect(await screen.findByRole("status")).toHaveTextContent("transaction hash copied to clipboard");
  });
});
