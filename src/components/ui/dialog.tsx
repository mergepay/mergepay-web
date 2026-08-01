"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  FOCUSABLE_SELECTOR,
  dialogStack,
  nextFocusIndex,
  pickInitialFocusIndex,
  shouldCloseOnEscape,
} from "@/lib/dialog";

/** Number of open modals, so nested dialogs restore page scroll only once. */
let openModalCount = 0;
let previousBodyOverflow = "";

/**
 * Hide the rest of the page from assistive tech while a modal is open, so a
 * screen reader's virtual cursor cannot wander into background content that
 * the Tab trap already blocks.
 *
 * Live regions are left alone — toasts raised by the dialog itself still need
 * to be announced.
 */
function hideBackgroundFromAssistiveTech(dialogRoot: Element | null): () => void {
  const hidden = (Array.from(document.body.children) as HTMLElement[]).filter(
    (el) =>
      el !== dialogRoot &&
      !el.hasAttribute("aria-hidden") &&
      !el.hasAttribute("aria-live") &&
      !el.hasAttribute("data-sonner-toaster")
  );

  for (const el of hidden) el.setAttribute("aria-hidden", "true");

  return () => {
    for (const el of hidden) el.removeAttribute("aria-hidden");
  };
}

/** Rendered and able to take focus — excludes `display: none` controls. */
function isVisible(el: HTMLElement): boolean {
  return (
    el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  description,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  /** Extra context announced with the dialog's accessible name. */
  description?: string;
  /**
   * When false, Escape, the backdrop, and the close button are all inert.
   * Use for dialogs that must not be abandoned mid-flight (e.g. a settlement
   * awaiting a wallet signature).
   */
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Read the latest props from inside the key handler without making the
  // effect depend on them. Consumers pass inline arrow functions for
  // `onClose`, so a dependency here would re-run the effect on every render —
  // and its cleanup would yank focus back to the trigger mid-interaction.
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = description ? `${baseId}-description` : undefined;

  const getFocusable = useCallback(
    () =>
      panelRef.current
        ? Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
          ).filter((el) => el.tabIndex !== -1 && isVisible(el))
        : [],
    []
  );

  useEffect(() => {
    if (!open) return;

    const dialogId = baseId;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    dialogStack.push(dialogId);
    if (openModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
    }
    openModalCount++;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (
        shouldCloseOnEscape({
          key: e.key,
          dismissible: dismissibleRef.current,
          isTopmost: dialogStack.isTopmost(dialogId),
        })
      ) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      // Keep Tab inside the topmost dialog so background content never
      // receives focus while a modal is open.
      if (e.key !== "Tab" || !dialogStack.isTopmost(dialogId)) return;
      const focusable = getFocusable();
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

    window.addEventListener("keydown", handleKeyDown, true);

    // Wait for the panel to mount (AnimatePresence renders it in the same
    // frame the dialog opens) before choosing an initial focus target.
    const focusFrame = requestAnimationFrame(() => {
      const focusable = getFocusable();
      const index = pickInitialFocusIndex(
        focusable.map((el) => ({
          autofocus: el.hasAttribute("data-autofocus"),
          inBody: bodyRef.current?.contains(el) ?? false,
        }))
      );
      if (index >= 0) focusable[index]?.focus();
      else panelRef.current?.focus();
    });

    // The overlay is the portal's direct child of <body>; everything beside it
    // is background content.
    const restoreBackground = hideBackgroundFromAssistiveTech(
      panelRef.current?.parentElement ?? null
    );

    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown, true);
      restoreBackground();
      dialogStack.remove(dialogId);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = previousBodyOverflow;
      // Hand focus back to whatever opened the dialog so keyboard users keep
      // their place on the page.
      previousFocusRef.current?.focus();
    };
  }, [open, baseId, getFocusable]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60"
          // Compare against `currentTarget` so a drag that starts inside the
          // panel and ends on the backdrop does not dismiss the dialog.
          onMouseDown={
            dismissible
              ? (e) => {
                  if (e.target === e.currentTarget) onClose();
                }
              : undefined
          }
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={cn(
              "w-full max-w-lg max-h-[90vh] overflow-y-auto bg-cream border-3 border-ink rounded-2xl shadow-brutal-xl focus:outline-none",
              className
            )}
          >
            <div className="flex items-center justify-between border-b-3 border-ink bg-butter px-5 py-3 rounded-t-[13px] sticky top-0 z-10">
              <h2
                id={titleId}
                className="font-display text-base uppercase tracking-tight"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                disabled={!dismissible}
                aria-label={`Close ${title}`}
                className="border-2 border-ink rounded-lg bg-cream p-1 shadow-brutal-sm hover:bg-flamingo transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cream focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {description && (
              <p id={descriptionId} className="sr-only">
                {description}
              </p>
            )}
            <div ref={bodyRef} className="p-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
