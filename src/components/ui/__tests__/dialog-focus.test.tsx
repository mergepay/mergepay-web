import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { Dialog } from "../dialog";

describe("Dialog Focus Trap and Accessibility", () => {
  test("focus moves to the first focusable element when dialog opens and returns to trigger on close", async () => {
    function TestComponent() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button data-testid="trigger-btn" onClick={() => setOpen(true)}>
            Open Dialog
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Test Dialog">
            <button data-testid="dialog-input">Inside Button</button>
          </Dialog>
        </div>
      );
    }

    render(<TestComponent />);

    const trigger = screen.getByTestId("trigger-btn");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByTestId("dialog-input")).toHaveFocus();
    });

    // Close via escape key
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  test("Tab and Shift+Tab wrap focus strictly inside open dialog elements and Escape closes dialog", async () => {
    const handleClose = vi.fn();

    render(
      <Dialog open={true} onClose={handleClose} title="Trap Dialog">
        <button data-testid="btn-one">One</button>
        <button data-testid="btn-two">Two</button>
      </Dialog>
    );

    const btnOne = screen.getByTestId("btn-one");
    const btnTwo = screen.getByTestId("btn-two");

    await waitFor(() => {
      expect(btnOne).toHaveFocus();
    });

    // Tab to next button
    fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
    btnTwo.focus();
    expect(document.activeElement).toBe(btnTwo);

    // Escape key triggers dismissal
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalled();
  });
});
