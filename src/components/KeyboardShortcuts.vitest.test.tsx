import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { useShortcut } from "@/hooks/useShortcut";
import { dialogStack } from "@/lib/dialog";
import {
  SINGLE_KEY_PREF_KEY,
  isEditableTarget,
  matchShortcut,
  resetShortcutHandlers,
} from "@/lib/keyboardShortcuts";

const key = (k: string, extra: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: k, bubbles: true, ...extra });

function Page({ onNewExpense }: { onNewExpense: () => void }) {
  useShortcut("new-expense", onNewExpense);
  return (
    <>
      <input aria-label="Expense title" />
      <textarea aria-label="Notes" />
      <button type="button">Plain button</button>
    </>
  );
}

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

beforeEach(() => {
  resetShortcutHandlers();
  dialogStack.clear();
  try {
    window.localStorage.removeItem(SINGLE_KEY_PREF_KEY);
  } catch {
    /* storage unavailable in this environment */
  }
});

afterEach(() => {
  resetShortcutHandlers();
  dialogStack.clear();
});

describe("matchShortcut", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

  it("maps single keys, case-insensitively", () => {
    expect(matchShortcut({ ...base, key: "n" })).toBe("new-expense");
    expect(matchShortcut({ ...base, key: "g" })).toBe("switch-group");
    expect(matchShortcut({ ...base, key: "w" })).toBe("wallet-login");
    expect(matchShortcut({ ...base, key: "?", shiftKey: true })).toBe("show-help");
  });

  it("ignores modified, repeated and IME-composing presses", () => {
    expect(matchShortcut({ ...base, key: "n", ctrlKey: true })).toBeNull();
    expect(matchShortcut({ ...base, key: "n", metaKey: true })).toBeNull();
    expect(matchShortcut({ ...base, key: "n", altKey: true })).toBeNull();
    expect(matchShortcut({ ...base, key: "N", shiftKey: true })).toBeNull();
    expect(matchShortcut({ ...base, key: "n", repeat: true })).toBeNull();
    expect(matchShortcut({ ...base, key: "n", isComposing: true })).toBeNull();
    expect(matchShortcut({ ...base, key: "x" })).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("treats text entry and composite widgets as editable", () => {
    document.body.innerHTML = `
      <input id="text" />
      <input id="check" type="checkbox" />
      <textarea id="area"></textarea>
      <select id="sel"><option>a</option></select>
      <div id="ce" contenteditable="true"></div>
      <div role="menu"><button id="item" role="menuitem">x</button></div>
      <button id="btn">b</button>`;
    const el = (id: string) => document.getElementById(id);
    expect(isEditableTarget(el("text"))).toBe(true);
    expect(isEditableTarget(el("area"))).toBe(true);
    expect(isEditableTarget(el("sel"))).toBe(true);
    expect(isEditableTarget(el("ce"))).toBe(true);
    expect(isEditableTarget(el("item"))).toBe(true);
    expect(isEditableTarget(el("check"))).toBe(false);
    expect(isEditableTarget(el("btn"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    document.body.innerHTML = "";
  });
});

describe("<KeyboardShortcuts />", () => {
  it("runs the page's handler for its shortcut", () => {
    const onNewExpense = vi.fn();
    render(
      <>
        <KeyboardShortcuts />
        <Page onNewExpense={onNewExpense} />
      </>
    );
    screen.getByRole("button", { name: "Plain button" }).focus();
    key("n");
    expect(onNewExpense).toHaveBeenCalledTimes(1);
  });

  it("never fires while typing in an input or textarea", () => {
    const onNewExpense = vi.fn();
    render(
      <>
        <KeyboardShortcuts />
        <Page onNewExpense={onNewExpense} />
      </>
    );
    screen.getByLabelText("Expense title").focus();
    key("n");
    screen.getByLabelText("Notes").focus();
    key("n");
    key("?", { shiftKey: true });
    expect(onNewExpense).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays out of the way while a modal dialog is open", () => {
    const onNewExpense = vi.fn();
    render(
      <>
        <KeyboardShortcuts />
        <Page onNewExpense={onNewExpense} />
      </>
    );
    dialogStack.push("some-dialog");
    key("n");
    expect(onNewExpense).not.toHaveBeenCalled();
  });

  it("does nothing (and doesn't swallow the key) when no page handles it", () => {
    render(<KeyboardShortcuts />);
    const notPrevented = key("w");
    expect(notPrevented).toBe(true);
  });

  it("? opens an accessible cheat sheet that documents every shortcut", async () => {
    const opener = document.createElement("button");
    opener.textContent = "opener";
    document.body.appendChild(opener);
    opener.focus();

    render(
      <>
        <KeyboardShortcuts />
        <Page onNewExpense={vi.fn()} />
      </>
    );
    key("?", { shiftKey: true });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    const table = within(dialog).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(6); // header + 5 shortcuts
    expect(within(dialog).getByTestId("shortcut-row-new-expense")).toHaveTextContent(
      "Available on this page"
    );
    expect(within(dialog).getByTestId("shortcut-row-wallet-login")).toHaveTextContent(
      "Not available on this page"
    );

    await flushFrames();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("single-key shortcuts can be turned off, and the choice is remembered", async () => {
    const onNewExpense = vi.fn();
    const { unmount } = render(
      <>
        <KeyboardShortcuts />
        <Page onNewExpense={onNewExpense} />
      </>
    );
    key("?", { shiftKey: true });
    fireEvent.click(screen.getByRole("checkbox", { name: /Single-key shortcuts/ }));
    expect(screen.getByTestId("shortcut-row-new-expense")).toHaveTextContent("Turned off");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    screen.getByRole("button", { name: "Plain button" }).focus();
    key("n");
    expect(onNewExpense).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SINGLE_KEY_PREF_KEY)).toBe("off");

    unmount();
    render(
      <>
        <KeyboardShortcuts />
        <Page onNewExpense={onNewExpense} />
      </>
    );
    await flushFrames();
    key("n");
    expect(onNewExpense).not.toHaveBeenCalled();
  });
});
