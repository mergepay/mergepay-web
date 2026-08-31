import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "../../components/ui/dialog";

describe("Dialog Accessibility & Focus Trapping", () => {
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

  it("restores focus to the triggering element upon closure", () => {
    const Trigger = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button data-testid="trigger" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Focus Test">
            <button data-testid="inside">Inside</button>
          </Dialog>
        </>
      );
    };

    // Render outside or use React correctly
  });
});
