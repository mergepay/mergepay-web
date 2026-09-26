import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Dialog } from "../../components/ui/dialog";
import { MobileDrawer } from "../../components/ui/MobileDrawer";
import { dialogStack, shouldCloseOnEscape } from "../../lib/dialog";

describe("Dialog Accessibility & Focus Trapping", () => {
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

  it("renders description in visible text (not sr-only)", () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Test Dialog" description="Test Description">
        <button>Inside Button</button>
      </Dialog>
    );

    expect(screen.getByText("Test Description")).toBeInTheDocument();
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

  it("renders close button with proper aria-label", () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Close Button Test">
        <button>Inside</button>
      </Dialog>
    );

    const closeButton = screen.getByLabelText("Close Close Button Test");
    expect(closeButton).toBeInTheDocument();
  });

  it("does not render close button when not dismissible", () => {
    render(
      <Dialog open={true} onClose={() => {}} title="No Close" dismissible={false}>
        <button>Inside</button>
      </Dialog>
    );

    expect(screen.queryByLabelText("Close No Close")).not.toBeInTheDocument();
  });

  it("focuses dialog content on open", async () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Focus Test">
        <button data-testid="body-button">Body Button</button>
      </Dialog>
    );

    const bodyButton = screen.getByTestId("body-button");
    // Wait for focus to be set (runs in requestAnimationFrame)
    await waitFor(() => {
      expect(document.activeElement).toBe(bodyButton);
    });
  });

  it("prioritizes data-autofocus element for initial focus", async () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Autofocus Test">
        <button data-testid="first">First</button>
        <button data-testid="autofocused" data-autofocus>Auto Focused</button>
        <button data-testid="third">Third</button>
      </Dialog>
    );

    const autofocused = screen.getByTestId("autofocused");
    await waitFor(() => {
      expect(document.activeElement).toBe(autofocused);
    });
  });
});

describe("MobileDrawer Accessibility & Focus Trapping", () => {
  beforeEach(() => {
    dialogStack.clear();
  });

  afterEach(() => {
    dialogStack.clear();
  });

  it("renders drawer with role=dialog, aria-modal=true, and aria-labelledby", () => {
    render(
      <MobileDrawer open={true} onClose={() => {}} title="Test Drawer">
        <button>Inside Button</button>
      </MobileDrawer>
    );

    const drawer = screen.getByRole("dialog");
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(drawer).toHaveAttribute("aria-labelledby");
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer open={true} onClose={onClose} title="Escape Test">
        <button>Button</button>
      </MobileDrawer>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when Escape is pressed on non-dismissible drawer", () => {
    const onClose = vi.fn();
    render(
      <MobileDrawer open={true} onClose={onClose} title="Non-dismissible" dismissible={false}>
        <button>Button</button>
      </MobileDrawer>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders close button with proper aria-label", () => {
    render(
      <MobileDrawer open={true} onClose={() => {}} title="Close Button Test">
        <button>Inside</button>
      </MobileDrawer>
    );

    const closeButton = screen.getByLabelText("Close drawer");
    expect(closeButton).toBeInTheDocument();
  });

  it("does not render close button when not dismissible", () => {
    render(
      <MobileDrawer open={true} onClose={() => {}} title="No Close" dismissible={false}>
        <button>Inside</button>
      </MobileDrawer>
    );

    expect(screen.queryByLabelText("Close drawer")).not.toBeInTheDocument();
  });

  it("focuses drawer content on open", async () => {
    render(
      <MobileDrawer open={true} onClose={() => {}} title="Focus Test">
        <button data-testid="body-button">Body Button</button>
      </MobileDrawer>
    );

    const bodyButton = screen.getByTestId("body-button");
    await waitFor(() => {
      expect(document.activeElement).toBe(bodyButton);
    });
  });

  it("prioritizes data-autofocus element for initial focus", async () => {
    render(
      <MobileDrawer open={true} onClose={() => {}} title="Autofocus Test">
        <button data-testid="first">First</button>
        <button data-testid="autofocused" data-autofocus>Auto Focused</button>
        <button data-testid="third">Third</button>
      </MobileDrawer>
    );

    const autofocused = screen.getByTestId("autofocused");
    await waitFor(() => {
      expect(document.activeElement).toBe(autofocused);
    });
  });

  it("supports different side positions (bottom, left, right)", () => {
    const { rerender } = render(
      <MobileDrawer open={true} onClose={() => {}} title="Bottom" side="bottom">
        <button>Content</button>
      </MobileDrawer>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <MobileDrawer open={true} onClose={() => {}} title="Left" side="left">
        <button>Content</button>
      </MobileDrawer>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <MobileDrawer open={true} onClose={() => {}} title="Right" side="right">
        <button>Content</button>
      </MobileDrawer>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Dialog Stack Management", () => {
  beforeEach(() => {
    dialogStack.clear();
  });

  it("tracks multiple dialogs in LIFO order", () => {
    dialogStack.push("dialog-1");
    dialogStack.push("dialog-2");
    dialogStack.push("dialog-3");

    expect(dialogStack.isTopmost("dialog-3")).toBe(true);
    expect(dialogStack.isTopmost("dialog-2")).toBe(false);
    expect(dialogStack.isTopmost("dialog-1")).toBe(false);
  });

  it("removes dialog from stack correctly", () => {
    dialogStack.push("dialog-1");
    dialogStack.push("dialog-2");
    dialogStack.remove("dialog-1");

    expect(dialogStack.has("dialog-1")).toBe(false);
    expect(dialogStack.has("dialog-2")).toBe(true);
    expect(dialogStack.isTopmost("dialog-2")).toBe(true);
  });

  it("shouldCloseOnEscape returns true only for topmost dismissible dialog", () => {
    dialogStack.push("dialog-1");
    dialogStack.push("dialog-2");

    expect(shouldCloseOnEscape({ key: "Escape", dismissible: true, isTopmost: true })).toBe(true);
    expect(shouldCloseOnEscape({ key: "Escape", dismissible: false, isTopmost: true })).toBe(false);
    expect(shouldCloseOnEscape({ key: "Escape", dismissible: true, isTopmost: false })).toBe(false);
    expect(shouldCloseOnEscape({ key: "Tab", dismissible: true, isTopmost: true })).toBe(false);
  });
});