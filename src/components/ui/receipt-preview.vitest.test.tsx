import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReceiptPreview } from "./receipt-preview";

const URL = "https://cdn.example.com/receipts/r1.jpg";

describe("ReceiptPreview", () => {
  it("does not render when closed", () => {
    render(<ReceiptPreview open={false} onClose={vi.fn()} url={URL} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the image and an accessible close button when open", () => {
    render(<ReceiptPreview open onClose={vi.fn()} url={URL} title="Receipt — Uber" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Receipt — Uber");
    expect(screen.getByRole("img", { name: /receipt — uber/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close receipt/i })).toBeInTheDocument();
  });

  it("closes when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ReceiptPreview open onClose={onClose} url={URL} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ReceiptPreview open onClose={onClose} url={URL} />);
    // The dialog is portaled into <body>; the backdrop is the fixed overlay
    // that wraps the panel. Clicking the backdrop (not the panel) dismisses.
    const backdrop = document.body.querySelector("div.fixed") as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});