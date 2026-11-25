import { afterEach, describe, expect, it } from "vitest";
import {
  isBodyScrollLocked,
  lockBodyScroll,
  resetBodyScrollLock,
  unlockBodyScroll,
} from "./scrollLock";

describe("scrollLock", () => {
  afterEach(() => {
    resetBodyScrollLock();
  });

  it("locks the body while an owner holds the lock", () => {
    expect(isBodyScrollLocked()).toBe(false);

    const owner = lockBodyScroll();
    expect(isBodyScrollLocked()).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    unlockBodyScroll(owner);
    expect(isBodyScrollLocked()).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("stays locked until the last owner releases", () => {
    const first = lockBodyScroll();
    const second = lockBodyScroll();

    // A nested overlay closing must not release the lock its parent owns.
    unlockBodyScroll(first);
    expect(isBodyScrollLocked()).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    unlockBodyScroll(second);
    expect(isBodyScrollLocked()).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the pre-existing inline overflow value", () => {
    document.body.style.overflow = "auto";

    const owner = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");

    unlockBodyScroll(owner);
    expect(document.body.style.overflow).toBe("auto");
  });

  it("is idempotent for repeated locks by the same owner", () => {
    const owner = Symbol("overlay");
    lockBodyScroll(owner);
    lockBodyScroll(owner);

    unlockBodyScroll(owner);
    expect(isBodyScrollLocked()).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores unlocking an unknown owner", () => {
    const owner = lockBodyScroll();

    unlockBodyScroll(Symbol("never-locked"));
    expect(isBodyScrollLocked()).toBe(true);

    unlockBodyScroll(owner);
    expect(isBodyScrollLocked()).toBe(false);
  });
});
