import { describe, expect, it } from "vitest";
import { dialogStack, shouldCloseOnEscape } from "./dialog";

describe("Neobrutalist modal keyboard navigation and focus stack (#616)", () => {
  it("closes only the topmost dismissible modal when Escape is pressed", () => {
    dialogStack.push("modal-base");
    dialogStack.push("modal-nested");

    expect(
      shouldCloseOnEscape({
        key: "Escape",
        dismissible: true,
        isTopmost: dialogStack.isTopmost("modal-base"),
      })
    ).toBe(false);

    expect(
      shouldCloseOnEscape({
        key: "Escape",
        dismissible: true,
        isTopmost: dialogStack.isTopmost("modal-nested"),
      })
    ).toBe(true);

    dialogStack.remove("modal-nested");
    dialogStack.remove("modal-base");
  });
});
