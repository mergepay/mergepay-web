import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FocusTrapModal } from "./FocusTrapModal";

describe("Neobrutalist dialog accessibility attributes (#601)", () => {
  it("renders role=dialog and aria-modal=true with labelled heading", () => {
    render(
      <FocusTrapModal open={true} onClose={vi.fn()} title="Settle Balance" description="Review Stellar payment">
        <button type="button">Approve</button>
      </FocusTrapModal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Settle Balance")).toBeInTheDocument();
  });
});
