import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FocusTrapModal } from "./FocusTrapModal";
import { dialogStack } from "@/lib/dialog";

describe("FocusTrapModal keyboard navigation and focus trapping (#722)", () => {
  beforeEach(() => {
    dialogStack.clear();
  });

  afterEach(() => {
    dialogStack.clear();
  });

  it("invokes onClose when Escape is pressed while modal is open", () => {
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

  it("traps keyboard focus within the dialog container via Tab and Shift+Tab wrapping", async () => {
    render(
      <FocusTrapModal open={true} onClose={vi.fn()} title="Trap Modal">
        <button type="button" data-testid="first-btn">First</button>
        <button type="button" data-testid="second-btn">Second</button>
      </FocusTrapModal>
    );

    const first = screen.getByTestId("first-btn");
    const second = screen.getByTestId("second-btn");
    const close = screen.getByRole("button", { name: "Close Trap Modal" });

    await waitFor(() => expect(first).toHaveFocus());

    // Focus last body button and Tab forward -> wraps to close button
    second.focus();
    fireEvent.keyDown(second, { key: "Tab" });
    expect(close).toHaveFocus();

    // Shift+Tab backward from close button -> wraps to last button
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(second).toHaveFocus();
  });

  it("returns focus to the triggering element when the modal dismisses", async () => {
    function ModalWithTrigger() {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <div>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open Dialog Trigger
          </button>
          <FocusTrapModal open={isOpen} onClose={() => setIsOpen(false)} title="Managed Modal">
            <button type="button">Inside Action</button>
          </FocusTrapModal>
        </div>
      );
    }

    render(<ModalWithTrigger />);
    const trigger = screen.getByRole("button", { name: "Open Dialog Trigger" });
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByRole("button", { name: "Inside Action" })).toHaveFocus());

    // Dismiss modal via Escape key
    fireEvent.keyDown(window, { key: "Escape" });

    // Focus returns to the trigger element
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
