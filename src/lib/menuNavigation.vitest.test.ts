import { describe, expect, it } from "vitest";
import {
  firstEnabledIndex,
  isTypeaheadKey,
  lastEnabledIndex,
  menuNavigationTarget,
  nextEnabledIndex,
  typeaheadIndex,
  type MenuItemState,
} from "./menuNavigation";
import { escapeBelongsToPopup } from "./dialog";

const items = (...labels: Array<string | [string, true]>): MenuItemState[] =>
  labels.map((l) => (Array.isArray(l) ? { label: l[0], disabled: true } : { label: l }));

describe("nextEnabledIndex", () => {
  const menu = items("Copy", ["Cut", true], "Paste", "Delete");

  it("steps forward and back, wrapping at the ends", () => {
    expect(nextEnabledIndex(menu, 0, 1)).toBe(2);
    expect(nextEnabledIndex(menu, 3, 1)).toBe(0);
    expect(nextEnabledIndex(menu, 0, -1)).toBe(3);
    expect(nextEnabledIndex(menu, 2, -1)).toBe(0);
  });

  it("starts from either end when nothing is focused", () => {
    expect(nextEnabledIndex(menu, -1, 1)).toBe(0);
    expect(nextEnabledIndex(menu, -1, -1)).toBe(3);
  });

  it("skips disabled items, and returns -1 when all are disabled", () => {
    expect(firstEnabledIndex(items(["A", true], "B"))).toBe(1);
    expect(lastEnabledIndex(items("A", ["B", true]))).toBe(0);
    expect(nextEnabledIndex(items(["A", true], ["B", true]), -1, 1)).toBe(-1);
    expect(nextEnabledIndex([], 0, 1)).toBe(-1);
  });
});

describe("menuNavigationTarget", () => {
  const menu = items("One", "Two", "Three");

  it("maps arrow, Home/End and Page keys", () => {
    expect(menuNavigationTarget("ArrowDown", menu, 0)).toBe(1);
    expect(menuNavigationTarget("ArrowUp", menu, 0)).toBe(2);
    expect(menuNavigationTarget("Home", menu, 2)).toBe(0);
    expect(menuNavigationTarget("End", menu, 0)).toBe(2);
    expect(menuNavigationTarget("PageUp", menu, 2)).toBe(0);
    expect(menuNavigationTarget("PageDown", menu, 0)).toBe(2);
  });

  it("ignores keys the menu handles itself", () => {
    for (const key of ["Escape", "Tab", "Enter", " ", "a"]) {
      expect(menuNavigationTarget(key, menu, 0)).toBeNull();
    }
  });
});

describe("type-ahead", () => {
  const menu = items("Export as CSV", "Export as JSON", ["Email", true], "Print");

  it("recognises single printable characters only", () => {
    expect(isTypeaheadKey({ key: "e" })).toBe(true);
    expect(isTypeaheadKey({ key: "E" })).toBe(true);
    expect(isTypeaheadKey({ key: " " })).toBe(false);
    expect(isTypeaheadKey({ key: "ArrowDown" })).toBe(false);
    expect(isTypeaheadKey({ key: "c", ctrlKey: true })).toBe(false);
    expect(isTypeaheadKey({ key: "c", metaKey: true })).toBe(false);
  });

  it("jumps to the next item starting with the letter, wrapping and skipping disabled", () => {
    expect(typeaheadIndex(menu, "p", 0)).toBe(3);
    expect(typeaheadIndex(menu, "e", -1)).toBe(0);
    expect(typeaheadIndex(menu, "e", 0)).toBe(1);
    // "Email" is disabled, so from JSON the search wraps to CSV.
    expect(typeaheadIndex(menu, "e", 1)).toBe(0);
  });

  it("refines with a longer query from the current item", () => {
    expect(typeaheadIndex(menu, "export as j", 0)).toBe(1);
    expect(typeaheadIndex(menu, "export as c", 0)).toBe(0);
  });

  it("cycles through matches when the same letter repeats", () => {
    expect(typeaheadIndex(menu, "ee", 0)).toBe(1);
    expect(typeaheadIndex(menu, "eee", 1)).toBe(0);
  });

  it("returns -1 when nothing matches", () => {
    expect(typeaheadIndex(menu, "z", 0)).toBe(-1);
    expect(typeaheadIndex(menu, "", 0)).toBe(-1);
  });
});

describe("escapeBelongsToPopup", () => {
  function build(html: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it("claims Escape for a menu, or an expanded menu button, inside the dialog", () => {
    const root = build(`
      <div role="dialog" id="d">
        <button id="trigger" aria-haspopup="menu" aria-expanded="true">Open</button>
        <div role="menu"><button role="menuitem" id="item">A</button></div>
        <button id="plain">Plain</button>
        <button id="closed" aria-haspopup="menu" aria-expanded="false">Closed</button>
        <div role="listbox"><button role="option" id="option">Opt</button></div>
      </div>`);
    const dialog = root.querySelector("#d");
    const at = (id: string) => root.querySelector(`#${id}`);
    expect(escapeBelongsToPopup(at("item"), dialog)).toBe(true);
    expect(escapeBelongsToPopup(at("trigger"), dialog)).toBe(true);
    expect(escapeBelongsToPopup(at("plain"), dialog)).toBe(false);
    expect(escapeBelongsToPopup(at("closed"), dialog)).toBe(false);
    // A listbox that is part of the dialog (the command palette) is not a popup.
    expect(escapeBelongsToPopup(at("option"), dialog)).toBe(false);
    root.remove();
  });

  it("ignores popups outside the dialog and non-element targets", () => {
    const root = build(`<div role="menu"><button id="outside" role="menuitem">X</button></div><div id="d"></div>`);
    expect(escapeBelongsToPopup(root.querySelector("#outside"), root.querySelector("#d"))).toBe(false);
    expect(escapeBelongsToPopup(window, root.querySelector("#d"))).toBe(false);
    expect(escapeBelongsToPopup(null, null)).toBe(false);
    root.remove();
  });
});
