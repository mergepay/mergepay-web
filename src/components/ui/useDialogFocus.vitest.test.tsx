// Focus and keyboard behaviour of the shared dialog hook (issue #709), in the
// situations the existing suites do not reach: a field that focuses itself on
// mount, a dialog whose `dismissible` flag changes while it is open, and the
// ARIA wiring a screen reader depends on.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dialogStack } from "@/lib/dialog";
import { Dialog } from "./dialog";
import { FocusTrapModal } from "./FocusTrapModal";

afterEach(() => {
  dialogStack.clear();
  document.body.style.overflow = "";
});

/** Let the hook's initial-focus frame run, whatever it decides to do. */
const settle = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

describe("initial focus", () => {
  it("leaves focus on a field that focused itself on mount, even beside a submit button", async () => {
    render(
      <Dialog open onClose={() => {}} title="Enable treasury">
        <form onSubmit={(e) => e.preventDefault()}>
          <input aria-label="Name" autoFocus />
          <button type="submit">Enable</button>
        </form>
      </Dialog>,
    );
    await settle();

    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("still prefers an explicit data-autofocus over the submit button", async () => {
    render(
      <Dialog open onClose={() => {}} title="Join group">
        <form onSubmit={(e) => e.preventDefault()}>
          <input aria-label="Code" data-autofocus />
          <button type="submit">Join</button>
        </form>
      </Dialog>,
    );

    await waitFor(() => expect(screen.getByLabelText("Code")).toHaveFocus());
  });

  it("still lands on the primary action when nothing in the dialog focuses itself", async () => {
    render(
      <Dialog open onClose={() => {}} title="Remove member">
        <p>This cannot be undone.</p>
        <button type="button">Keep</button>
        <button type="submit">Remove</button>
      </Dialog>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).toHaveFocus());
  });

  it("returns focus to the trigger when it closes, even if a field inside took focus on mount", async () => {
    function Example() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open treasury
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Enable treasury">
            <input aria-label="Name" autoFocus />
            <button type="button">Enable</button>
          </Dialog>
        </>
      );
    }
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Open treasury" });
    trigger.focus();
    fireEvent.click(trigger);
    await settle();
    expect(screen.getByLabelText("Name")).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("moves focus in from the page behind when nothing inside has focus", async () => {
    render(
      <>
        <button type="button">Behind</button>
        <Dialog open onClose={() => {}} title="Plain">
          <button type="button">First</button>
        </Dialog>
      </>,
    );
    screen.getByRole("button", { name: "Behind" }).focus();

    await waitFor(() => expect(screen.getByRole("button", { name: "First" })).toHaveFocus());
  });
});

describe("a dialog whose dismissible flag changes while it is open", () => {
  function Busy({ dismissible, onClose = () => {} }: { dismissible: boolean; onClose?: () => void }) {
    return (
      <Dialog open onClose={onClose} title="Deposit" dismissible={dismissible}>
        <input aria-label="Amount" />
        <button type="button">Deposit now</button>
      </Dialog>
    );
  }

  it("keeps focus where the user left it", async () => {
    const view = render(<Busy dismissible />);
    await settle();
    const submit = screen.getByRole("button", { name: "Deposit now" });
    submit.focus();

    view.rerender(<Busy dismissible={false} />);
    await settle();

    expect(submit).toHaveFocus();
  });

  it("does not hand focus back to the page behind mid-flight", async () => {
    render(
      <>
        <button type="button">Open</button>
        <Busy dismissible />
      </>,
    );
    await settle();

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("applies the new value to Escape straight away", async () => {
    const onClose = vi.fn();
    const view = render(<Busy dismissible onClose={onClose} />);
    await settle();

    view.rerender(<Busy dismissible={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    view.rerender(<Busy dismissible onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not take Escape from a dialog stacked above it", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    const Stack = ({ outerDismissible }: { outerDismissible: boolean }) => (
      <>
        <Dialog open onClose={outerClose} title="Outer" dismissible={outerDismissible}>
          <button type="button">Outer action</button>
        </Dialog>
        <Dialog open onClose={innerClose} title="Inner">
          <button type="button">Inner action</button>
        </Dialog>
      </>
    );
    const view = render(<Stack outerDismissible />);
    await settle();

    // The outer dialog locks and unlocks (a request starts and ends) under the inner one.
    view.rerender(<Stack outerDismissible={false} />);
    view.rerender(<Stack outerDismissible />);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it("still returns focus to the trigger when it finally closes", async () => {
    function Example() {
      const [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open deposit
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Deposit" dismissible={!busy}>
            <button type="button" onClick={() => setBusy((b) => !b)}>
              Toggle busy
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </Dialog>
        </>
      );
    }
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Open deposit" });
    trigger.focus();
    fireEvent.click(trigger);
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Toggle busy" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle busy" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe("ARIA wiring", () => {
  it("Dialog names itself by its title and describes itself by its description", () => {
    render(
      <Dialog open onClose={() => {}} title="Invite member" description="They get a link by email.">
        <button type="button">Send</button>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Invite member" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent("They get a link by email.");
  });

  it("Dialog has no aria-describedby when there is nothing to point at", () => {
    render(
      <Dialog open onClose={() => {}} title="Plain">
        <button type="button">Ok</button>
      </Dialog>,
    );

    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("FocusTrapModal names and describes itself the same way", () => {
    render(
      <FocusTrapModal onClose={() => {}} title="Share" description="Anyone with the link can join.">
        <button type="button">Copy</button>
      </FocusTrapModal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Share" });
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy as string)).toHaveTextContent("Anyone with the link can join.");
  });

  it("FocusTrapModal falls back to a generic name when it has no title", () => {
    render(
      <FocusTrapModal onClose={() => {}}>
        <button type="button">Ok</button>
      </FocusTrapModal>,
    );

    expect(screen.getByRole("dialog", { name: "Dialog" })).toBeInTheDocument();
  });

  it("gives two open dialogs different title and description ids", () => {
    render(
      <>
        <Dialog open onClose={() => {}} title="One" description="First">
          <button type="button">a</button>
        </Dialog>
        <Dialog open onClose={() => {}} title="Two" description="Second">
          <button type="button">b</button>
        </Dialog>
      </>,
    );

    const [one, two] = screen.getAllByRole("dialog");
    expect(one?.getAttribute("aria-labelledby")).not.toBe(two?.getAttribute("aria-labelledby"));
    expect(one?.getAttribute("aria-describedby")).not.toBe(two?.getAttribute("aria-describedby"));
  });
});
