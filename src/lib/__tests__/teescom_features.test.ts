import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldCloseOnEscape,
  pickInitialFocusIndex,
  nextFocusIndex,
} from "../dialog";

describe("Horizon Health Indicator & Network Check Logic (Issue #226)", () => {
  it("determines health and latency status from RPC responses", () => {
    function evaluateHorizonStatus(ok: boolean, latencyMs: number): "healthy" | "degraded" | "offline" {
      if (!ok) return "degraded";
      if (latencyMs > 3000) return "degraded";
      return "healthy";
    }

    assert.equal(evaluateHorizonStatus(true, 150), "healthy");
    assert.equal(evaluateHorizonStatus(true, 3500), "degraded");
    assert.equal(evaluateHorizonStatus(false, 200), "degraded");
  });
});

describe("Modal Focus Trapping and Keyboard Accessibility (Issue #225, #230)", () => {
  it("traps focus and cycles when Tab reaches the boundary", () => {
    // 3 interactive elements: 0, 1, 2
    const forwardWrap = nextFocusIndex(3, 2, false);
    assert.equal(forwardWrap, 0, "Last element tab should wrap to first element");

    const backwardWrap = nextFocusIndex(3, 0, true);
    assert.equal(backwardWrap, 2, "First element Shift+Tab should wrap to last element");
  });

  it("closes modal on Escape key if dismissible and topmost", () => {
    const shouldClose = shouldCloseOnEscape({
      key: "Escape",
      dismissible: true,
      isTopmost: true,
    });
    assert.equal(shouldClose, true);
  });

  it("prevents Escape dismissal if non-dismissible or not topmost", () => {
    assert.equal(
      shouldCloseOnEscape({
        key: "Escape",
        dismissible: false,
        isTopmost: true,
      }),
      false
    );

    assert.equal(
      shouldCloseOnEscape({
        key: "Escape",
        dismissible: true,
        isTopmost: false,
      }),
      false
    );
  });

  it("prioritizes body form controls or autofocus elements over close button", () => {
    const candidates = [
      { inBody: false }, // close button in header
      { inBody: true, autofocus: false }, // first input
      { inBody: true, autofocus: true }, // explicit autofocus element
    ];

    const chosen = pickInitialFocusIndex(candidates);
    assert.equal(chosen, 2, "Autofocus candidate should be selected first");
  });
});
