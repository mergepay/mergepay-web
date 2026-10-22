import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { dialogStack } from "@/lib/dialog";

// A mutable pathname so a test can "navigate" and re-render, the way the app
// re-renders when next/navigation reports a new route.
const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

beforeEach(() => {
  dialogStack.clear();
  nav.pathname = "/dashboard";
  document.body.style.overflow = "auto";
});

afterEach(() => {
  dialogStack.clear();
  document.body.style.overflow = "";
});

function NavHarness() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open menu
      </button>
      <MobileNavDrawer open={open} onClose={() => setOpen(false)} />
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

describe("MobileNavDrawer closes on route change (#619)", () => {
  it("closes itself when navigation moves to another page", async () => {
    const { rerender } = render(<NavHarness />);
    await openDrawer();
    // The drawer is open: scroll is locked and it owns the dialog stack slot.
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialogStack.size).toBe(1);

    // The route changes without any link inside the drawer being clicked —
    // e.g. the browser's back button.
    nav.pathname = "/history";
    rerender(<NavHarness />);

    await waitFor(() => expect(document.body.style.overflow).toBe("auto"));
    expect(dialogStack.size).toBe(0);
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  it("stays open while the route has not changed", async () => {
    render(<NavHarness />);
    const { panel } = await openDrawer();

    expect(panel).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialogStack.size).toBe(1);
  });

  it("does not fire onClose for an already-closed drawer on mount or route change", () => {
    const onClose = vi.fn();
    const { rerender } = render(<MobileNavDrawer open={false} onClose={onClose} />);

    nav.pathname = "/settings";
    rerender(<MobileNavDrawer open={false} onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();
  });
});
