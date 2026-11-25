import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Dialog } from "../../components/ui/dialog";
import { MobileDrawer } from "../../components/ui/MobileDrawer";
import {
  createFocusContainmentListener,
  dialogStack,
  shouldCloseOnEscape,
} from "../../lib/dialog";

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

  it("prioritizes primary action element for initial focus when no autofocus", async () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Primary Action Test">
        <button data-testid="cancel-btn">Cancel</button>
        <button data-testid="primary-btn" data-primary-action>Confirm Settlement</button>
      </Dialog>
    );

    const primaryBtn = screen.getByTestId("primary-btn");
    await waitFor(() => {
      expect(document.activeElement).toBe(primaryBtn);
    });
  });

  it("traps focus and wraps from last to first element on Tab", async () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Tab Wrap Test">
        <button data-testid="first-btn">First</button>
        <button data-testid="last-btn">Last</button>
      </Dialog>
    );

    const closeBtn = screen.getByLabelText("Close Tab Wrap Test");
    const lastBtn = screen.getByTestId("last-btn");

    // Focus last button inside dialog
    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);

    // Press Tab on the last button -> wraps to close button (first overall focusable in dialog)
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);
  });

  it("traps focus and wraps from first to last element on Shift+Tab", async () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Shift Tab Wrap Test">
        <button data-testid="first-btn">First</button>
        <button data-testid="last-btn">Last</button>
      </Dialog>
    );

    const closeBtn = screen.getByLabelText("Close Shift Tab Wrap Test");
    const lastBtn = screen.getByTestId("last-btn");

    // Focus first overall element (close button in header)
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Press Shift+Tab on first element -> wraps to last button
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastBtn);
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

describe("createFocusContainmentListener", () => {
  function makeFixture() {
    const container = document.createElement("div");
    container.tabIndex = -1;
    const first = document.createElement("button");
    const second = document.createElement("button");
    container.append(first, second);
    const outside = document.createElement("button");
    document.body.append(container, outside);

    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>("button"));
    const cleanup = () => {
      container.remove();
      outside.remove();
    };

    return { container, first, second, outside, getFocusable, cleanup };
  }

  it("leaves focus alone while it stays inside the container", () => {
    const { container, first, outside, getFocusable, cleanup } = makeFixture();
    const listener = createFocusContainmentListener({
      getContainer: () => container,
      getFocusable,
      isActive: () => true,
    });
    document.addEventListener("focusin", listener);

    first.focus();
    first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(first);

    document.removeEventListener("focusin", listener);
    cleanup();
  });

  it("moves focus back to the first control when focus escapes", () => {
    const { container, first, outside, getFocusable, cleanup } = makeFixture();
    const listener = createFocusContainmentListener({
      getContainer: () => container,
      getFocusable,
      isActive: () => true,
    });
    document.addEventListener("focusin", listener);

    outside.focus();
    // Real browsers dispatch focusin when focus lands outside the dialog;
    // dispatch it explicitly so the test does not depend on jsdom's own
    // focus event plumbing.
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(first);

    document.removeEventListener("focusin", listener);
    cleanup();
  });

  it("does nothing while the dialog is no longer topmost", () => {
    const { container, outside, getFocusable, cleanup } = makeFixture();
    const listener = createFocusContainmentListener({
      getContainer: () => container,
      getFocusable,
      isActive: () => false,
    });
    document.addEventListener("focusin", listener);

    outside.focus();
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(outside);

    document.removeEventListener("focusin", listener);
    cleanup();
  });

  it("does nothing once the container is detached from the document", () => {
    const { container, outside, getFocusable, cleanup } = makeFixture();
    const listener = createFocusContainmentListener({
      getContainer: () => container,
      getFocusable,
      isActive: () => true,
    });
    document.addEventListener("focusin", listener);
    container.remove();

    outside.focus();
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(outside);

    document.removeEventListener("focusin", listener);
    cleanup();
  });

  it("parks focus on the container when it has no focusable controls", () => {
    const container = document.createElement("div");
    container.tabIndex = -1;
    document.body.append(container);
    const outside = document.createElement("button");
    document.body.append(outside);

    const listener = createFocusContainmentListener({
      getContainer: () => container,
      getFocusable: () => [],
      isActive: () => true,
    });
    document.addEventListener("focusin", listener);

    outside.focus();
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(document.activeElement).toBe(container);

    document.removeEventListener("focusin", listener);
    container.remove();
    outside.remove();
  });
});

describe("Dialog focus containment & scroll lock", () => {
  beforeEach(() => {
    dialogStack.clear();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    dialogStack.clear();
    document.body.style.overflow = "";
  });

  it("pulls focus back into the dialog when it escapes", async () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Containment Test">
        <button data-testid="inner">Inside</button>
      </Dialog>
    );

    const inner = screen.getByTestId("inner");
    await waitFor(() => {
      expect(document.activeElement).toBe(inner);
    });

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).not.toBe(outside);
    expect(dialog.contains(document.activeElement)).toBe(true);

    outside.remove();
  });

  it("locks background scrolling while open and restores it on close", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="Scroll Lock">
        <button>Inside</button>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("");

    rerender(
      <Dialog open={true} onClose={() => {}} title="Scroll Lock">
        <button>Inside</button>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Dialog open={false} onClose={() => {}} title="Scroll Lock">
        <button>Inside</button>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("restores focus to the previously focused element when unmounted", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Dialog open={true} onClose={() => {}} title="Restore Test">
        <button data-testid="inner">Inside</button>
      </Dialog>
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId("inner"));
    });

    unmount();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it("marks the dialog body so focus rules do not depend on class names", () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Content Marker">
        <button data-testid="inner">Inside</button>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("[data-dialog-content]")).not.toBeNull();
  });
});
