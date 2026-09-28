"use client";

/**
 * Minimal accessible dialog primitive built on the native `<dialog>` element.
 *
 * `showModal()` provides `role="dialog"`, `aria-modal="true"` semantics, focus
 * containment, and Escape-key dismissal for free. The Escape-to-close behavior
 * is wired through the `cancel` event (fired when the user presses Escape
 * while the dialog is modal) and `onClose` is invoked for both programmatic
 * and user-initiated dismissal so trigger buttons regain focus via the
 * browser's built-in restore.
 */

import { useEffect, useId, useRef } from "react";
import { dialogStack, shouldCloseOnEscape } from "@/lib/dialog";

export interface AccessibleDialogProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** Called when the dialog is dismissed via Escape or the close affordance. */
  onClose: () => void;
  /** Accessible name for the dialog (rendered via the internal heading). */
  title?: string;
  /** Disable Escape/backdrop dismissal, e.g. for destructive flows. */
  dismissible?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function AccessibleDialog({
  isOpen,
  onClose,
  title,
  dismissible = true,
  children,
  className,
}: AccessibleDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const wasOpenRef = useRef(false);
  const stackId = useId();

  // Register with the shared stack so only the topmost dialog reacts to Escape.
  useEffect(() => {
    if (!isOpen) return;
    dialogStack.push(stackId);
    return () => dialogStack.remove(stackId);
  }, [isOpen, stackId]);

  // Keep the native element in sync with the React-driven open state.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Escape is routed through the shared `shouldCloseOnEscape` policy so stacked
  // dialogs only react when they are the topmost entry.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      const allowed = shouldCloseOnEscape({
        key: "Escape",
        dismissible,
        isTopmost: dialogStack.isTopmost(stackId),
      });
      // Always prevent the native default so dismissal goes through React state.
      event.preventDefault();
      if (allowed) onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [dismissible, onClose, stackId]);

  // Closing the element outside of React state (e.g. the native close button)
  // is surfaced so the parent can reset `isOpen`.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      if (wasOpenRef.current) onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose, stackId]);

  useEffect(() => {
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-label={title}
      className={className ?? "rounded-2xl border-3 border-ink bg-cream p-6 shadow-brutal"}
    >
      {title && (
        <h2 className="font-display text-lg uppercase tracking-tight">{title}</h2>
      )}
      {children}
    </dialog>
  );
}
