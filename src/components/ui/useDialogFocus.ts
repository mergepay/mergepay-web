import * as React from "react";

export interface DialogFocusOptions {
  open: boolean;
  onClose: () => void;
  /**
   * The `role="dialog"` panel. It must carry `tabIndex={-1}`: that is where
   * focus is parked when the dialog has no controls to Tab to, and a plain
   * `div` cannot receive focus, so the trap would silently do nothing.
   */
  panelRef: React.RefObject<HTMLElement | null>;
  contentRef?: React.RefObject<HTMLElement | null>;
  /** When false, Escape is ignored — e.g. a settlement mid-signature. */
  dismissible?: boolean;
}
export interface UseDialogFocusOptions {
  open: boolean;
  onClose: () => void;
  /**
   * The `role="dialog"` panel. It must carry `tabIndex={-1}`: that is where
   * focus is parked when the dialog has no controls to Tab to, and a plain
   * `div` cannot receive focus, so the trap would silently do nothing.
   */
  panelRef: React.RefObject<HTMLElement | null>;
  /**
   * The dialog body when it can be told apart from the title bar. Initial
   * focus prefers the first control here over the close button; without it
   * the panel itself takes focus. Marking the body with a ref instead of a
   * class selector keeps the rule working through a styling change.
   */
  contentRef?: React.RefObject<HTMLElement | null>;
  /** When false, Escape is ignored — e.g. a settlement mid-signature. */
  dismissible?: boolean;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useDialogFocus({
  open,
  onClose,
  panelRef,
  contentRef,
  dismissible = true,
}: UseDialogFocusOptions) {
  const previouslyFocusedElement = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) {
      previouslyFocusedElement.current = document.activeElement as HTMLElement;

      const timer = setTimeout(() => {
        const container = (contentRef ? contentRef.current : null) || panelRef.current;
        if (container) {
          const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
          if (focusables.length > 0) {
            focusables[0].focus();
          } else if (panelRef.current) {
            panelRef.current.focus();
          }
        }
      }, 50);

      return () => clearTimeout(timer);
    } else {
      if (previouslyFocusedElement.current && typeof previouslyFocusedElement.current.focus === "function") {
        previouslyFocusedElement.current.focus();
      }
    }
  }, [open, panelRef, contentRef]);

  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab") {
        const container = (contentRef ? contentRef.current : null) || panelRef.current;
        if (!container) return;

        const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
        );

        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement;

        if (event.shiftKey) {
          if (active === first || !container.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !container.contains(active)) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, dismissible, onClose, panelRef, contentRef]);
}
