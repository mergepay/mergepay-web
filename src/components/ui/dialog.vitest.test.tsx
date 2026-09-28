import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Dialog } from "./dialog";
import { dialogStack } from "@/lib/dialog";

describe("Dialog Primitive Accessibility & Focus Trapping", () => {
  beforeEach(() => {
    dialogStack.clear();
  });

  afterEach(() => {
    dialogStack.clear();
  });

  it("renders dialog with role=dialog, aria-modal=true, and aria-labelledby", () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Test Dialog" description="Test Description">
        <button>Inside Button</button>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} title="Escape Test">
        <button>Button</button>
      </Dialog>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when Escape is pressed on non-dismissible dialog", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} title="Non-dismissible" dismissible={false}>
        <button>Button</button>
      </Dialog>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when clicking backdrop if dismissible is true", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} title="Backdrop Test" dismissible={true}>
        <button>Button</button>
      </Dialog>
    );

    const backdrop = screen.getByRole("dialog").previousElementSibling;
    expect(backdrop).toBeInTheDocument();
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
