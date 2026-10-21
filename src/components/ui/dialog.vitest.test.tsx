import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("wraps Shift+Tab focus from the close control to the last body control", async () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Tab Trap">
        <button data-testid="first">First</button>
        <button data-testid="last">Last</button>
      </Dialog>
    );

    const last = screen.getByTestId("last");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("first")));

    const close = screen.getByRole("button", { name: "Close Tab Trap" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(last);
  });

  it("only dismisses the topmost dialog when dialogs are nested", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    render(
      <>
        <Dialog open={true} onClose={outerClose} title="Outer">
          <button>Outer action</button>
        </Dialog>
        <Dialog open={true} onClose={innerClose} title="Inner">
          <button>Inner action</button>
        </Dialog>
      </>
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Inner" }), { key: "Escape" });

    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });
  it("returns focus to the keyboard trigger after Escape dismisses the dialog", async () => {
    function Example() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open expense</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Add expense">
            <button type="button">Save expense</button>
          </Dialog>
        </>
      );
    }
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Open expense" });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save expense" })).toHaveFocus());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps focus on the topmost dialog when two dialogs are open", async () => {
    render(
      <>
        <Dialog open onClose={() => {}} title="Lower"><button type="button">Lower action</button></Dialog>
        <Dialog open onClose={() => {}} title="Upper"><button type="button">Upper action</button></Dialog>
      </>
    );
    const upper = screen.getByRole("button", { name: "Upper action" });
    await waitFor(() => expect(upper).toHaveFocus());
    const event = fireEvent.keyDown(upper, { key: "Tab" });
    expect(event).toBe(false);
    expect(screen.getByRole("button", { name: "Close Upper" })).toHaveFocus();
  });

  it("does not move focus to hidden controls inside a dialog", async () => {
    render(
      <Dialog open onClose={() => {}} title="Visible controls">
        <div hidden><button type="button">Hidden control</button></div>
        <button type="button">Visible action</button>
      </Dialog>
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Visible action" })).toHaveFocus());
    const close = screen.getByRole("button", { name: "Close Visible controls" });
    close.focus();
    // Close is the first Tab stop; Shift+Tab wraps to the last visible control.
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Visible action" })).toHaveFocus();
  });

});
