"use client";

import { useEffect } from "react";
import { lockBodyScroll, unlockBodyScroll } from "./scrollLock";

/**
 * Lock `document.body` scrolling while `active` is true, restoring the
 * previous inline value when the overlay closes or unmounts.
 *
 * Reference-counted (see `scrollLock.ts`), so stacked overlays cooperate
 * instead of fighting over `body.style.overflow`.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const owner = lockBodyScroll();
    return () => unlockBodyScroll(owner);
  }, [active]);
}
