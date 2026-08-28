import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DialogStack,
  FOCUSABLE_SELECTOR,
  dialogStack,
  nextFocusIndex,
  pickInitialFocusIndex,
  shouldCloseOnEscape,
} from "../dialog";

// ---------------------------------------------------------------------------
// Escape handling
// ---------------------------------------------------------------------------

describe("shouldCloseOnEscape", () => {
  const cases: {
    name: string;
    key: string;
    dismissible: boolean;
    isTopmost: boolean;
    expected: boolean;
  }[] = [
    { name: "Escape on a dismissible topmost dialog", key: "Escape", dismissible: true, isTopmost: true, expected: true },
    { name: "Escape on a non-dismissible dialog", key: "Escape", dismissible: false, isTopmost: true, expected: false },
    { name: "Escape on a dialog behind another", key: "Escape", dismissible: true, isTopmost: false, expected: false },
    { name: "Enter never dismisses", key: "Enter", dismissible: true, isTopmost: true, expected: false },
    { name: "Tab never dismisses", key: "Tab", dismissible: true, isTopmost: true, expected: false },
    { name: "Esc (legacy key name) is not Escape", key: "Esc", dismissible: true, isTopmost: true, expected: false },
  ];

  for (const c of cases) {
    it(c.name, () => {
      assert.equal(
        shouldCloseOnEscape({
          key: c.key,
          dismissible: c.dismissible,
          isTopmost: c.isTopmost,
        }),
        c.expected
      );
    });
  }

  it("keeps a transaction dialog open while it is non-dismissible", () => {
    // Mirrors the settle dialog mid-signature: dismissible flips to false.
    const midFlight = { key: "Escape", dismissible: false, isTopmost: true };
    assert.equal(shouldCloseOnEscape(midFlight), false);
    assert.equal(shouldCloseOnEscape({ ...midFlight, dismissible: true }), true);
  });
});

// ---------------------------------------------------------------------------
// Modal stacking
// ---------------------------------------------------------------------------

describe("DialogStack", () => {
  let stack: DialogStack;

  beforeEach(() => {
    stack = new DialogStack();
  });

  it("starts empty", () => {
    assert.equal(stack.size, 0);
    assert.equal(stack.isTopmost("a"), false);
  });

  it("tracks the most recently opened dialog as topmost", () => {
    stack.push("a");
    assert.equal(stack.isTopmost("a"), true);

    stack.push("b");
    assert.equal(stack.isTopmost("b"), true);
    assert.equal(stack.isTopmost("a"), false);
    assert.equal(stack.size, 2);
  });

  it("restores the previous dialog as topmost when the top one closes", () => {
    stack.push("a");
    stack.push("b");
    stack.remove("b");
    assert.equal(stack.isTopmost("a"), true);
    assert.equal(stack.size, 1);
  });

  it("does not duplicate a dialog pushed twice", () => {
    stack.push("a");
    stack.push("a");
    assert.equal(stack.size, 1);
  });

  it("re-pushing an open dialog moves it to the top", () => {
    stack.push("a");
    stack.push("b");
    stack.push("a");
    assert.equal(stack.isTopmost("a"), true);
    assert.equal(stack.size, 2);
  });

  it("ignores removal of a dialog that is not open", () => {
    stack.push("a");
    stack.remove("ghost");
    assert.equal(stack.size, 1);
    assert.equal(stack.isTopmost("a"), true);
  });

  it("handles out-of-order teardown", () => {
    stack.push("a");
    stack.push("b");
    stack.remove("a");
    assert.equal(stack.isTopmost("b"), true);
    assert.equal(stack.has("a"), false);
  });

  it("exposes a shared module-level stack", () => {
    dialogStack.clear();
    assert.equal(dialogStack.size, 0);
    dialogStack.push("shared");
    assert.equal(dialogStack.isTopmost("shared"), true);
    dialogStack.clear();
  });
});

// ---------------------------------------------------------------------------
// Initial focus
// ---------------------------------------------------------------------------

describe("pickInitialFocusIndex", () => {
  it("returns -1 when the dialog has nothing focusable", () => {
    assert.equal(pickInitialFocusIndex([]), -1);
  });

  it("prefers an explicitly marked control", () => {
    const candidates = [
      { inBody: false }, // close button
      { inBody: true },
      { inBody: true, autofocus: true },
    ];
    assert.equal(pickInitialFocusIndex(candidates), 2);
  });

  it("falls back to the first control in the body, not the close button", () => {
    const candidates = [
      { inBody: false }, // close button in the title bar
      { inBody: true }, // first form field
      { inBody: true },
    ];
    assert.equal(pickInitialFocusIndex(candidates), 1);
  });

  it("falls back to the close button when the body has no controls", () => {
    assert.equal(pickInitialFocusIndex([{ inBody: false }]), 0);
  });

  it("uses the first explicit marker when several are present", () => {
    const candidates = [
      { inBody: true, autofocus: true },
      { inBody: true, autofocus: true },
    ];
    assert.equal(pickInitialFocusIndex(candidates), 0);
  });
});

// ---------------------------------------------------------------------------
// Focus containment
// ---------------------------------------------------------------------------

describe("nextFocusIndex", () => {
  const cases: {
    name: string;
    count: number;
    current: number;
    shift: boolean;
    expected: number | null;
  }[] = [
    { name: "Tab in the middle defers to the browser", count: 4, current: 1, shift: false, expected: null },
    { name: "Tab on the last control wraps to the first", count: 4, current: 3, shift: false, expected: 0 },
    { name: "Shift+Tab in the middle defers to the browser", count: 4, current: 2, shift: true, expected: null },
    { name: "Shift+Tab on the first control wraps to the last", count: 4, current: 0, shift: true, expected: 3 },
    { name: "Tab with a single control stays on it", count: 1, current: 0, shift: false, expected: 0 },
    { name: "Shift+Tab with a single control stays on it", count: 1, current: 0, shift: true, expected: 0 },
    { name: "focus outside the dialog is pulled to the first control", count: 3, current: -1, shift: false, expected: 0 },
    { name: "Shift+Tab from outside the dialog lands on the last control", count: 3, current: -1, shift: true, expected: 2 },
    { name: "nothing focusable leaves the browser alone", count: 0, current: -1, shift: false, expected: null },
  ];

  for (const c of cases) {
    it(c.name, () => {
      assert.equal(nextFocusIndex(c.count, c.current, c.shift), c.expected);
    });
  }

  it("never lets Tab escape a dialog, wherever focus starts", () => {
    const count = 3;
    for (let i = -1; i < count; i++) {
      for (const shift of [false, true]) {
        const target = nextFocusIndex(count, i, shift);
        if (target !== null) {
          assert.ok(
            target >= 0 && target < count,
            `index ${target} is outside the dialog`
          );
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Focusable selector
// ---------------------------------------------------------------------------

describe("FOCUSABLE_SELECTOR", () => {
  it("covers the control types the dialogs actually use", () => {
    for (const fragment of [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
    ]) {
      assert.ok(
        FOCUSABLE_SELECTOR.includes(fragment),
        `expected selector to include ${fragment}`
      );
    }
  });

  it("excludes programmatic-only focus targets", () => {
    assert.ok(FOCUSABLE_SELECTOR.includes('[tabindex]:not([tabindex="-1"])'));
  });
});
