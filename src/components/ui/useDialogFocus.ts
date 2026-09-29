"use client";

import { useCallback, useEffect, useId, useRef, type RefObject } from "react";
import {
  FOCUSABLE_SELECTOR,
  createFocusContainmentListener,
  dialogStack,
  nextFocusIndex,
  pickInitialFocusIndex,
  shouldCloseOnEscape,
} from "@/lib/dialog";

export interface DialogFocusOptions {
  open: boolean;
  onClose: () => void;
  /**
   * The `role="dialog"` panel. It must carry `tabIndex={-1}`: that is where
   * focus is parked when the dialog has no controls to Tab to, and a plain
   * `div` cannot receive focus, so the trap would silently do nothing.
   */
  panelRef: RefObject<HTMLElement | null>;
  /**
   * The dialog body when it can be told apart from the title bar. Initial
   * focus prefers the first control here over the close button; without it
   * the panel itself takes focus. Marking the body with a ref instead of a
   * class selector keeps the rule working through a styling change.
   */
  contentRef?: RefObject<HTMLElement | null>;
  /** When false, Escape is ignored — e.g. a settlement mid-signature. */
  dismissible?: boolean;
}

/**
 * The focus and keyboard contract every modal surface in the app shares:
 * focus enters the dialog when it opens, Tab cannot walk out of it, focus that
 * escapes some other way is pulled back, Escape closes only the topmost
 * dialog, the page behind cannot scroll, and focus returns to the trigger on
 * close.
 *
 * The rules themselves are the pure functions in `src/lib/dialog.ts`; this
 * hook is only the DOM wiring, so `Dialog`, `MobileDrawer`, the nav drawer and
 * the receipt lightbox cannot drift four different versions of "trapped", and
 * a keyboard-only user gets the same behaviour from all of them.
 */
export function useDialogFocus({
  open,
  onClose,
  panelRef,
  contentRef,
  dismissible = true,
}: DialogFocusOptions): void {
  // Per-instance stack slot. A hard-coded id would make two simultaneously
  // open surfaces of the same type fight for one slot.
  const slotId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const listFocusable = useCallback((root: HTMLElement | null) => {
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.tabIndex !== -1
    );
  }, []);

  useEffect(() => {
    if (!open) return;

    dialogStack.push(slotId);
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panelFocusable = () => listFocusable(panelRef.current);
    const contentFocusable = () => listFocusable(contentRef?.current ?? null);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (
        shouldCloseOnEscape({
          key: e.key,
          dismissible,
          isTopmost: dialogStack.isTopmost(slotId),
        })
      ) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab") return;
      const focusable = panelFocusable();
      const active = document.activeElement as HTMLElement | null;
      const target = nextFocusIndex(
        focusable.length,
        active ? focusable.indexOf(active) : -1,
        e.shiftKey
      );
      if (target === null) return;
      e.preventDefault();
      focusable[target]?.focus();
    }

    // Wait a frame: the panel is often rendered by the same commit that flips
    // `open`, and with an exit animation its controls may not be in the DOM
    // yet when this effect runs.
    const frame = requestAnimationFrame(() => {
      const body = contentFocusable();
      if (body.length > 0) {
        const index = pickInitialFocusIndex(
          body.map((el) => ({ autofocus: el.hasAttribute("data-autofocus"), inBody: true }))
        );
        (body[index] ?? panelRef.current)?.focus();
        return;
      }
      panelRef.current?.focus();
    });

    const containment = createFocusContainmentListener({
      getContainer: () => panelRef.current,
      getFocusable: panelFocusable,
      isActive: () => dialogStack.isTopmost(slotId),
    });

    // Window, not the document: a key event targeted at the document itself
    // never bubbles up to it, so a document listener would miss it — and every
    // element-targeted press passes through window on its way, so this catches
    // both. Capture, so `stopPropagation` wins over shortcuts bound below.
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", containment);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", containment);
      dialogStack.remove(slotId);
      document.body.style.overflow = previousOverflow;
      // Only hand focus back if the trigger is still on the page — a route
      // change can unmount it while this dialog was open.
      const previous = previousFocusRef.current;
      if (previous?.isConnected && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [open, slotId, dismissible, panelRef, contentRef, listFocusable]);
}
