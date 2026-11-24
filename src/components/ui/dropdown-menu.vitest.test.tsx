import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu, DropdownMenuItem } from "./dropdown-menu";
import { Dialog } from "./dialog";

/**
 * The shared menu-button primitive (#813): WAI-ARIA attributes, keyboard
 * traversal, dismissal and focus restoration.
 */

function Menu({
  onSelect = vi.fn(),
  disabledItem = false,
  disabled = false,
  onOpenChange,
}: {
  onSelect?: (label: string) => void;
  disabledItem?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <>
      <button type="button">Before</button>
      <DropdownMenu
        label="Member actions"
        disabled={disabled}
        onOpenChange={onOpenChange}
        trigger={(props) => (
          <button type="button" {...props}>
            Actions
          </button>
        )}
      >
        <DropdownMenuItem onSelect={() => onSelect("Promote")}>Promote to admin</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect("Copy")} disabled={disabledItem}>
          Copy address
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect("Remove")}>Remove member</DropdownMenuItem>
      </DropdownMenu>
      <button type="button">After</button>
    </>
  );
}

const trigger = () => screen.getByRole("button", { name: "Actions" });
const menu = () => screen.getByRole("menu", { name: "Member actions" });
const items = () => screen.getAllByRole("menuitem");

describe("DropdownMenu ARIA", () => {
  it("wires the trigger to the menu with aria-haspopup / aria-expanded / aria-controls", () => {
    render(<Menu />);
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", menu().id);
    expect(menu()).toHaveAttribute("aria-orientation", "vertical");
    expect(items()).toHaveLength(3);
    // Roving focus: Tab never stops on an item.
    for (const item of items()) expect(item).toHaveAttribute("tabindex", "-1");
  });

  it("marks disabled items aria-disabled without removing them", () => {
    render(<Menu disabledItem />);
    fireEvent.click(trigger());
    expect(items()[1]).toHaveAttribute("aria-disabled", "true");
    expect(items()[0]).not.toHaveAttribute("aria-disabled");
  });
});

describe("DropdownMenu keyboard", () => {
  it.each([
    ["ArrowDown", 0],
    ["Enter", 0],
    [" ", 0],
    ["ArrowUp", 2],
  ])("%j on the trigger opens on the right item", (key, focused) => {
    render(<Menu />);
    trigger().focus();
    fireEvent.keyDown(trigger(), { key });
    expect(items()[focused]).toHaveFocus();
  });

  it("clicking the trigger opens the menu on its first item", () => {
    render(<Menu />);
    fireEvent.click(trigger());
    expect(items()[0]).toHaveFocus();
  });

  it("arrows move and wrap, Home/End jump", () => {
    render(<Menu />);
    fireEvent.click(trigger());
    fireEvent.keyDown(menu(), { key: "ArrowDown" });
    expect(items()[1]).toHaveFocus();
    fireEvent.keyDown(menu(), { key: "ArrowDown" });
    fireEvent.keyDown(menu(), { key: "ArrowDown" });
    expect(items()[0]).toHaveFocus();
    fireEvent.keyDown(menu(), { key: "ArrowUp" });
    expect(items()[2]).toHaveFocus();
    fireEvent.keyDown(menu(), { key: "Home" });
    expect(items()[0]).toHaveFocus();
    fireEvent.keyDown(menu(), { key: "End" });
    expect(items()[2]).toHaveFocus();
  });

  it("skips disabled items while navigating", () => {
    render(<Menu disabledItem />);
    fireEvent.click(trigger());
    fireEvent.keyDown(menu(), { key: "ArrowDown" });
    expect(items()[2]).toHaveFocus();
  });

  it("type-ahead jumps to the item starting with the typed letter", () => {
    vi.useFakeTimers();
    try {
      render(<Menu />);
      fireEvent.click(trigger());
      fireEvent.keyDown(menu(), { key: "r" });
      expect(items()[2]).toHaveFocus();
      act(() => {
        vi.advanceTimersByTime(600);
      });
      fireEvent.keyDown(menu(), { key: "c" });
      expect(items()[1]).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Escape closes the menu and returns focus to the trigger", () => {
    render(<Menu />);
    fireEvent.click(trigger());
    fireEvent.keyDown(items()[1], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("Tab closes the menu without trapping focus", () => {
    render(<Menu />);
    fireEvent.click(trigger());
    fireEvent.keyDown(menu(), { key: "Tab" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    // Focus is back on the trigger so the browser's Tab moves on from there.
    expect(trigger()).toHaveFocus();
  });
});

describe("DropdownMenu selection and dismissal", () => {
  it("runs onSelect, closes, and restores focus to the trigger", () => {
    const onSelect = vi.fn();
    render(<Menu onSelect={onSelect} />);
    fireEvent.click(trigger());
    fireEvent.click(items()[2]);
    expect(onSelect).toHaveBeenCalledWith("Remove");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("ignores clicks on a disabled item and stays open", () => {
    const onSelect = vi.fn();
    render(<Menu onSelect={onSelect} disabledItem />);
    fireEvent.click(trigger());
    fireEvent.click(items()[1]);
    expect(onSelect).not.toHaveBeenCalled();
    expect(menu()).toBeInTheDocument();
  });

  it("closes on an outside press without stealing focus back", () => {
    render(<Menu />);
    fireEvent.click(trigger());
    const after = screen.getByRole("button", { name: "After" });
    fireEvent.mouseDown(after);
    after.focus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(after).toHaveFocus();
  });

  it("closes when focus leaves the menu", () => {
    render(<Menu />);
    fireEvent.click(trigger());
    fireEvent.blur(items()[0], { relatedTarget: screen.getByRole("button", { name: "Before" }) });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("never opens while disabled", () => {
    render(<Menu disabled />);
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("reports open and close through onOpenChange", () => {
    const onOpenChange = vi.fn();
    render(<Menu onOpenChange={onOpenChange} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(menu(), { key: "Escape" });
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });
});

describe("DropdownMenu inside a Dialog", () => {
  function MenuInDialog({ onClose }: { onClose: () => void }) {
    const [open] = useState(true);
    return (
      <Dialog open={open} onClose={onClose} title="Manage member">
        <Menu />
      </Dialog>
    );
  }

  it("Escape closes only the menu, then a second Escape closes the dialog", async () => {
    const onClose = vi.fn();
    render(<MenuInDialog onClose={onClose} />);
    fireEvent.click(trigger());
    expect(items()[0]).toHaveFocus();

    fireEvent.keyDown(items()[0], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();

    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
