"use client";

import * as React from "react";
import { useEffect, useRef, useCallback, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  dialogStack,
  createFocusContainmentListener,
  FOCUSABLE_SELECTOR,
  pickInitialFocusIndex,
  nextFocusIndex,
  shouldCloseOnEscape,
} from "@/lib/dialog";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** When false, backdrop clicks, Escape and the close button are disabled. */
  dismissible?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  dismissible = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const dialogId = useId();

  const titleId = useId();
  const descriptionId = useId();

  // Get focusable elements inside the dialog content (excluding title bar)
  const getFocusable = useCallback(() => {
    if (!dialogRef.current) return [];
    const content = dialogRef.current.querySelector("[data-dialog-content]");
    if (!content) return [];
    return Array.from(
      content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.tabIndex !== -1);
  }, []);

  // Get all focusable elements (including title bar) for focus trapping
  const getAllFocusable = useCallback(() => {
    if (!dialogRef.current) return [];
    return Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.tabIndex !== -1);
  }, []);

  // Store the previously focused element and restore focus on close
  useEffect(() => {
    if (open) {
      // Register this dialog in the stack
      dialogStack.push(dialogId);
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus the first focusable element in content (preferring body content over close button)
      const frame = requestAnimationFrame(() => {
        const focusable = getFocusable();
        if (focusable.length === 0) {
          // Fallback to all focusable if no content focusable
          const allFocusable = getAllFocusable();
          if (allFocusable.length === 0) {
            dialogRef.current?.focus();
            return;
          }
          const candidates = allFocusable.map((el) => ({
            autofocus: el.hasAttribute("data-autofocus"),
            primary:
              el.hasAttribute("data-primary-action") ||
              el.hasAttribute("data-primary") ||
              el.getAttribute("type") === "submit",
            inBody: !el.closest('[class*="border-b"]'),
          }));
          const initialIndex = pickInitialFocusIndex(candidates);
          allFocusable[initialIndex]?.focus();
          return;
        }

        // Build candidates for initial focus selection
        const candidates = focusable.map((el) => ({
          autofocus: el.hasAttribute("data-autofocus"),
          primary:
            el.hasAttribute("data-primary-action") ||
            el.hasAttribute("data-primary") ||
            el.getAttribute("type") === "submit",
          inBody: true, // All in content are considered "in body"
        }));

        const initialIndex = pickInitialFocusIndex(candidates);
        focusable[initialIndex]?.focus();
      });

      return () => {
        cancelAnimationFrame(frame);
        dialogStack.remove(dialogId);
        // Unmounting while open (route change, parent removal) must not
        // strand focus on a dead element — send it back to the trigger.
        if (
          previousActiveElement.current &&
          typeof previousActiveElement.current.focus === "function"
        ) {
          previousActiveElement.current.focus();
        }
      };
    } else {
      dialogStack.remove(dialogId);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === "function") {
        previousActiveElement.current.focus();
      }
    }
  }, [open, dialogId, getFocusable, getAllFocusable]);

  // Handle Escape key and focus trapping
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Escape key - only close if this is the topmost dialog
      if (shouldCloseOnEscape({ key: e.key, dismissible, isTopmost: dialogStack.isTopmost(dialogId) })) {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const focusable = getAllFocusable();
      if (focusable.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const currentIndex = active ? focusable.indexOf(active) : -1;
      const target = nextFocusIndex(focusable.length, currentIndex, e.shiftKey);

      if (target === null) return;
      e.preventDefault();
      focusable[target]?.focus();
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, onClose, dismissible, dialogId, getAllFocusable]);

  // Pull focus back whenever it lands outside the dialog (#481). Tab handling
  // only constrains the next key press; browser chrome, screen-reader
  // shortcuts and programmatic focus can still walk straight out of the
  // panel, which strands keyboard-only users behind the backdrop.
  useEffect(() => {
    if (!open) return;

    const listener = createFocusContainmentListener({
      getContainer: () => dialogRef.current,
      getFocusable: getAllFocusable,
      isActive: () => dialogStack.isTopmost(dialogId),
    });
    document.addEventListener("focusin", listener);
    return () => {
      document.removeEventListener("focusin", listener);
    };
  }, [open, dialogId, getAllFocusable]);

  // Freeze the page behind the dialog while it is open and put the previous
  // scroll position back on close, so the background cannot be scrolled out
  // from under an open modal.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/60 backdrop-blur-sm transition-opacity"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Dialog Window */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl border-3 border-ink bg-paper p-6 shadow-brutal outline-none max-h-[90vh] overflow-y-auto",
          className
        )}
      >
        <div className="flex items-center justify-between pb-4 border-b-2 border-ink">
          <h2 id={titleId} className="font-display text-lg uppercase tracking-wider">
            {title}
          </h2>
          {dismissible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="h-8 w-8 p-0 rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {description && (
          <p id={descriptionId} className="text-sm text-ink/70">
            {description}
          </p>
        )}

        {/* `data-dialog-content` marks the body the focus rules use — a class
            name would silently break the trap on a style change. */}
        <div className="pt-4" data-dialog-content>
          {children}
        </div>
      </div>
    </div>
  );
}
