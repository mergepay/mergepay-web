import * as React from "react";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./dialog";
import { MobileDrawer } from "./MobileDrawer";
import { AccessibleDialog } from "./AccessibleDialog";
import { dialogStack, shouldCloseOnEscape } from "@/lib/dialog";
import { isBodyScrollLocked, resetBodyScrollLock } from "@/lib/scrollLock";

/**
 * Keyboard trap and focus management across the overlay primitives (#885):
 * Escape closes only the topmost overlay and returns focus to its trigger,
 * background scrolling stays locked while any overlay is open (including
 * when stacked overlays close out of order), and an Escape that belongs to
 * an IME composition never discards the dialog.
 */

beforeEach(() => {
  dialogStack.clear();
  resetBodyScrollLock();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

afterEach(() => {
  dialogStack.clear();
  resetBodyScrollLock();
});

function pressEscape(init: KeyboardEventInit = {}) {
  return fireEvent.keyDown(window, { key: "Escape", ...init });
}

/** A drawer with a confirmation dialog stacked over it, each with its own trigger. */
function StackedHarness() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDrawerOpen(true)}>
        Open drawer
      </button>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters">
        <button type="button" onClick={() => setConfirmOpen(true)}>
          Reset filters
        </button>
        {/* Lets a test close the drawer underneath the open confirmation. */}
        <button type="button" data-testid="force-close-drawer" onClick={() => setDrawerOpen(false)}>
          hidden closer
        </button>
      </MobileDrawer>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm reset">
        <button type="button">Yes, reset</button>
      </Dialog>
    </>
  );
}

async function openBoth() {
  render(<StackedHarness />);
  const drawerTrigger = screen.getByRole("button", { name: "Open drawer" });
  drawerTrigger.focus();
  fireEvent.click(drawerTrigger);
  const confirmTrigger = await screen.findByRole("button", { name: "Reset filters" });
  await waitFor(() => expect(confirmTrigger).toHaveFocus());
  fireEvent.click(confirmTrigger);
  const yes = await screen.findByRole("button", { name: "Yes, reset" });
  await waitFor(() => expect(yes).toHaveFocus());
  return { drawerTrigger, confirmTrigger, yes };
}

describe("stacked overlays", () => {
  it("Escape closes only the topmost overlay and restores focus to its trigger", async () => {
    const { drawerTrigger, confirmTrigger } = await openBoth();

    pressEscape();
    expect(screen.queryByRole("button", { name: "Yes, reset" })).not.toBeInTheDocument();
    expect(confirmTrigger).toHaveFocus();
    expect(dialogStack.size).toBe(1);

    pressEscape();
    expect(drawerTrigger).toHaveFocus();
    expect(dialogStack.size).toBe(0);
  });

  it("keeps the page locked while any overlay is open and releases it after the last", async () => {
    document.body.style.overflow = "auto";
    await openBoth();
    expect(document.body.style.overflow).toBe("hidden");

    pressEscape();
    expect(document.body.style.overflow).toBe("hidden");
    expect(isBodyScrollLocked()).toBe(true);

    pressEscape();
    expect(document.body.style.overflow).toBe("auto");
    expect(isBodyScrollLocked()).toBe(false);
  });

  it("does not unlock the page when the lower overlay closes first", async () => {
    document.body.style.overflow = "auto";
    await openBoth();

    // Close the drawer underneath while the confirmation is still on top.
    act(() => {
      (screen.getByTestId("force-close-drawer") as HTMLButtonElement).click();
    });
    expect(document.body.style.overflow).toBe("hidden");

    pressEscape();
    expect(document.body.style.overflow).toBe("auto");
  });
});

describe("Escape during IME composition", () => {
  it("is ignored by the shared policy", () => {
    expect(shouldCloseOnEscape({ key: "Escape", dismissible: true, isTopmost: true, isComposing: true })).toBe(false);
    expect(shouldCloseOnEscape({ key: "Escape", dismissible: true, isTopmost: true })).toBe(true);
  });

  it("does not close a Dialog while the user is composing text", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Add note">
        <input aria-label="Note" />
      </Dialog>
    );
    await waitFor(() => expect(screen.getByLabelText("Note")).toHaveFocus());

    pressEscape({ isComposing: true });
    expect(onClose).not.toHaveBeenCalled();

    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AccessibleDialog focus management", () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open native
        </button>
        <AccessibleDialog
          isOpen={open}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
          title="Native dialog"
        >
          <button type="button">Inside</button>
        </AccessibleDialog>
      </>
    );
  }

  it("calls onClose once per Escape and suppresses the native cancel", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open native" }));

    const inside = screen.getByRole("button", { name: "Inside" });
    const notCancelled = fireEvent.keyDown(inside, { key: "Escape" });
    expect(notCancelled).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the trigger after closing", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open native" });
    trigger.focus();
    fireEvent.click(trigger);

    const inside = screen.getByRole("button", { name: "Inside" });
    inside.focus();
    fireEvent.keyDown(inside, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("locks background scrolling while open", () => {
    document.body.style.overflow = "auto";
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open native" }));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(screen.getByRole("button", { name: "Inside" }), { key: "Escape" });
    expect(document.body.style.overflow).toBe("auto");
  });
});
