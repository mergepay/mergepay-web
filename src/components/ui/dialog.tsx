"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

let dialogCount = 0;

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
  description?: string;
  dismissible?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  const getFocusableElements = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.tabIndex !== -1);
  }, []);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogCount += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (dismissibleRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      const content = contentRef.current;

      if (focusable.length === 0) {
        event.preventDefault();
        content?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === first || !content?.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeElement === last || !content?.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const content = contentRef.current;
      const target = event.target;
      if (!content || !(target instanceof Node) || content.contains(target)) return;

      const focusable = getFocusableElements();
      (focusable[0] ?? content).focus();
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      (focusable[0] ?? contentRef.current)?.focus();
    });

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      dialogCount -= 1;
      if (dialogCount <= 0) {
        document.body.style.overflow = previousOverflow;
      }

      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus());
      }
    };
  }, [open, getFocusableElements]);

  if (typeof document === "undefined") return null;

  const describedById = description ? "dialog-description" : undefined;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          onClick={dismissible ? onClose : undefined}
        >
          <motion.div
            ref={contentRef}
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={cn(
              "w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border-3 border-ink bg-cream shadow-brutal-xl",
              className
            )}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            aria-describedby={describedById}
            tabIndex={-1}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[13px] border-b-3 border-ink bg-butter px-5 py-3">
              <h2 className="font-display text-base uppercase tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                disabled={!dismissible}
                aria-label="Close dialog"
                className="rounded-lg border-2 border-ink bg-cream p-1 shadow-brutal-sm transition-colors hover:bg-flamingo disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cream"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {description && (
              <div id="dialog-description" className="sr-only">
                {description}
              </div>
            )}
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
