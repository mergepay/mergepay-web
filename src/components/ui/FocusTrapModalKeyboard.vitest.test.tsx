import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FocusTrapModal } from "./FocusTrapModal";

describe("FocusTrapModal keyboard navigation (#608)", () => {
  it("invokes onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <FocusTrapModal open={true} onClose={onClose} title="Confirm Action">
        <button type="button">Confirm</button>
      </FocusTrapModal>
    );
    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
