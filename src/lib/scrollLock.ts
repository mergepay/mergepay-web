/**
 * Reference-counted `document.body` scroll lock shared by every overlay.
 *
 * Overlays stack: a confirmation dialog can open over a drawer, and a receipt
 * lightbox over an expense card. If each overlay wrote
 * `document.body.style.overflow` directly, the last one to close would clobber
 * the restore value written by the others — either leaking `overflow: hidden`
 * onto the page or releasing the lock while another overlay is still open.
 *
 * Counting the active locks removes that class of bug: the body is locked while
 * at least one overlay is open, and the original inline overflow is restored
 * only when the last one closes.
 *
 * Kept free of React/DOM-at-import dependencies so it can be unit tested and
 * used from a small `useBodyScrollLock` hook.
 */

const owners = new Set<symbol>();
let previousOverflow: string | null = null;

function body(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.body;
}

/**
 * Register an active overlay. Safe to call more than once for the same owner
 * (idempotent). Returns the owner token to pass to {@link unlockBodyScroll};
 * when omitted, a fresh token is generated and returned.
 */
export function lockBodyScroll(owner: symbol = Symbol("scroll-lock")): symbol {
  const element = body();
  if (!element) return owner;
  if (owners.has(owner)) return owner;

  // Only the first lock captures the caller's original value, so a nested
  // overlay never overwrites it with "hidden".
  if (owners.size === 0) {
    previousOverflow = element.style.overflow;
    element.style.overflow = "hidden";
  }

  owners.add(owner);
  return owner;
}

/** Release an overlay's lock. Unknown owners are a no-op. */
export function unlockBodyScroll(owner: symbol): void {
  if (!owners.delete(owner)) return;
  const element = body();
  if (!element || owners.size > 0) return;

  element.style.overflow = previousOverflow ?? "";
  previousOverflow = null;
}

/** `true` while at least one overlay holds the lock. */
export function isBodyScrollLocked(): boolean {
  return owners.size > 0;
}

/**
 * Test seam: drop every lock and clear the inline overflow.
 * Not used by application code.
 */
export function resetBodyScrollLock(): void {
  owners.clear();
  previousOverflow = null;
  const element = body();
  if (element) element.style.overflow = "";
}
