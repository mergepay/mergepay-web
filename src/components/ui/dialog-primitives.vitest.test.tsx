import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";
import { MobileDrawer } from "./MobileDrawer";
import { ReceiptPreview } from "./receipt-preview";
import { MobileNavDrawer } from "../layout/MobileNavDrawer";
import { dialogStack } from "@/lib/dialog";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

/** Fires a Tab the way a keyboard does — on the window, which every focused
 *  element's press propagates through. Returns whether the handler cancelled
 *  the browser's own focus move. */
function pressTab(shift = false) {
  return fireEvent.keyDown(window, { key: "Tab", shiftKey: shift });
}

/** Waits for the rAF that places initial focus, so a later explicit `.focus()`
 *  is not overwritten by it. */
async function focusHasSettled(element: HTMLElement) {
  await waitFor(() => expect(element).toHaveFocus());
}

beforeEach(() => {
  dialogStack.clear();
});

afterEach(() => {
  dialogStack.clear();
  document.body.style.overflow = "";
});

function ExpensiveDialog() {
  return (
    <Dialog open onClose={() => {}} title="Split">
      <button type="button">One</button>
      <button type="button">Two</button>
      <button type="button">Three</button>
    </Dialog>
  );
}

describe("useDialogFocus — Tab wraps inside the dialog (#546)", () => {
  it("wraps forward from the last control to the first", async () => {
    render(<ExpensiveDialog />);
    const close = screen.getByRole("button", { name: /close split/i });
    const one = screen.getByRole("button", { name: "One" });
    const three = screen.getByRole("button", { name: "Three" });
    await focusHasSettled(one);

    three.focus();
    // fireEvent returns false once a handler has called preventDefault.
    expect(pressTab()).toBe(false);
    expect(close).toHaveFocus();
  });

  it("wraps backward from the first control to the last", async () => {
    render(<ExpensiveDialog />);
    const close = screen.getByRole("button", { name: /close split/i });
    const one = screen.getByRole("button", { name: "One" });
    const three = screen.getByRole("button", { name: "Three" });
    await focusHasSettled(one);

    close.focus();
    pressTab(true);
    expect(three).toHaveFocus();
  });

  it("does not cancel a Tab that stays inside the dialog", async () => {
    render(<ExpensiveDialog />);
    const one = screen.getByRole("button", { name: "One" });
    const two = screen.getByRole("button", { name: "Two" });
    await focusHasSettled(one);

    expect(pressTab()).toBe(true);
    expect(one).toHaveFocus();
    expect(two).not.toHaveFocus();
  });

  it("pulls focus in from the panel when the body has no controls", async () => {
    render(
      <Dialog open onClose={() => {}} title="Note">
        <p>Nothing to focus</p>
      </Dialog>
    );
    const panel = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: /close note/i });
    await focusHasSettled(panel);

    pressTab();
    expect(close).toHaveFocus();
  });
});

describe("modal panels can hold focus (#546)", () => {
  // A `div` without tabIndex cannot receive `.focus()`: both the initial focus
  // and the "nothing to Tab to" fallback would silently do nothing, leaving
  // the keyboard user on the page behind the overlay.
  it.each([
    [
      "Dialog",
      () => (
        <Dialog open onClose={() => {}} title="Plain">
          <p>Nothing to focus</p>
        </Dialog>
      ),
    ],
    [
      "MobileDrawer",
      () => (
        <MobileDrawer open onClose={() => {}} title="Drawer">
          <p>Nothing to focus</p>
        </MobileDrawer>
      ),
    ],
    ["MobileNavDrawer", () => <MobileNavDrawer open onClose={() => {}} />],
    [
      "ReceiptPreview",
      () => <ReceiptPreview open onClose={() => {}} url="https://x.test/r.png" />,
    ],
  ])("%s exposes a focusable role=dialog panel", (_name, renderSurface) => {
    render(renderSurface());
    expect(screen.getByRole("dialog")).toHaveAttribute("tabindex", "-1");
  });

  it("names the lightbox dialog by the receipt title", () => {
    render(
      <ReceiptPreview open onClose={() => {}} url="https://x.test/r.png" title="Lunch" />
    );
    expect(screen.getByRole("dialog", { name: "Lunch" })).toBeInTheDocument();
  });
});

describe("Escape belongs to the topmost surface only (#546)", () => {
  it("a lightbox over a dialog takes the first Escape, the dialog the second", () => {
    const dialogClose = vi.fn();
    const previewClose = vi.fn();

    function Harness({ withPreview }: { withPreview: boolean }) {
      return (
        <>
          <Dialog open onClose={dialogClose} title="Add expense">
            <button type="button">Save</button>
          </Dialog>
          {withPreview && (
            <ReceiptPreview
              open
              onClose={previewClose}
              url="https://x.test/r.png"
              title="Receipt"
            />
          )}
        </>
      );
    }

    const view = render(<Harness withPreview />);
    expect(dialogStack.size).toBe(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(previewClose).toHaveBeenCalledTimes(1);
    expect(dialogClose).not.toHaveBeenCalled();

    // Dismissing the lightbox hands ownership back down the stack.
    view.rerender(<Harness withPreview={false} />);
    expect(dialogStack.size).toBe(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialogClose).toHaveBeenCalledTimes(1);
  });

  it("two drawers of the same kind do not fight for one stack slot", () => {
    // With a hard-coded id the second registration overwrote the first, so the
    // bottom drawer could never be dismissed and both claimed focus.
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    render(
      <>
        <MobileDrawer open onClose={firstClose} title="First">
          <button type="button">A</button>
        </MobileDrawer>
        <MobileDrawer open onClose={secondClose} title="Second">
          <button type="button">B</button>
        </MobileDrawer>
      </>
    );
    expect(dialogStack.size).toBe(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(firstClose).not.toHaveBeenCalled();
  });

  it("a dismissible dialog above a locked drawer takes Escape", () => {
    const lockedClose = vi.fn();
    const floatingClose = vi.fn();

    render(
      <>
        <MobileDrawer open onClose={lockedClose} title="Signing" dismissible={false}>
          <button type="button">A</button>
        </MobileDrawer>
        <Dialog open onClose={floatingClose} title="Confirm">
          <button type="button">B</button>
        </Dialog>
      </>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(floatingClose).toHaveBeenCalledTimes(1);
    expect(lockedClose).not.toHaveBeenCalled();
  });

  it("a locked drawer on top ignores Escape entirely", () => {
    const lockedClose = vi.fn();
    render(
      <MobileDrawer open onClose={lockedClose} title="Signing" dismissible={false}>
        <button type="button">A</button>
      </MobileDrawer>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(lockedClose).not.toHaveBeenCalled();
    expect(dialogStack.size).toBe(1);
  });
});

describe("MobileNavDrawer keyboard behaviour (#546)", () => {
  function NavHarness() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open menu
        </button>
        <MobileNavDrawer open={open} onClose={() => setOpen(false)} />
        <button type="button">Behind the drawer</button>
      </>
    );
  }

  async function openDrawer() {
    const trigger = screen.getByRole("button", { name: "Open menu" });
    // A real click focuses the button first and `fireEvent.click` does not, so
    // focus it here — otherwise there is no trigger for the drawer to hand
    // focus back to.
    trigger.focus();
    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "Navigation menu" });
    return { trigger, panel };
  }

  it("moves focus into the drawer when it opens", async () => {
    render(<NavHarness />);
    const { panel } = await openDrawer();
    await focusHasSettled(panel);
  });

  it("keeps Tab inside the drawer at both ends", async () => {
    render(<NavHarness />);
    const { panel } = await openDrawer();

    const controls = Array.from(
      panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
    );
    expect(controls.length).toBeGreaterThan(1);
    const first = controls[0];
    const last = controls[controls.length - 1];

    last.focus();
    pressTab();
    expect(first).toHaveFocus();

    first.focus();
    pressTab(true);
    expect(last).toHaveFocus();
  });

  it("returns focus to the hamburger when Escape closes it", async () => {
    render(<NavHarness />);
    const { trigger, panel } = await openDrawer();

    fireEvent.keyDown(window, { key: "Escape" });
    // The panel is still in the DOM while framer-motion slides it out, so the
    // contract is that it no longer holds focus or a stack slot — not that it
    // has vanished.
    expect(trigger).toHaveFocus();
    expect(panel).not.toHaveFocus();
    expect(dialogStack.size).toBe(0);
  });

  it("locks the page behind the drawer and puts the scroll back on close", async () => {
    document.body.style.overflow = "auto";
    render(<NavHarness />);
    await openDrawer();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).toBe("auto");
  });
});
