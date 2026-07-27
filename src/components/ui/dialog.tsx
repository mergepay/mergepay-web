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

  const getFocusableElements = useCallback(() => {
    if (!contentRef.current) return [];
    return Array.from(
      contentRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.tabIndex !== -1);
  }, []);

  const trapFocus = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [getFocusableElements]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        onClose();
      }
      trapFocus(e);
    },
    [dismissible, onClose, trapFocus]
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    dialogCount++;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      dialogCount--;
      if (dialogCount <= 0) {
        document.body.style.overflow = "";
      }
      requestAnimationFrame(() => {
        previousFocusRef.current?.focus();
      });
    };
  }, [open, handleKeyDown, getFocusableElements]);

  if (typeof document === "undefined") return null;

  const describedById = description ? "dialog-description" : undefined;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60"
          onClick={dismissible ? onClose : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          aria-describedby={describedById}
        >
          <motion.div
            ref={contentRef}
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={cn(
              "w-full max-w-lg max-h-[90vh] overflow-y-auto bg-cream border-3 border-ink rounded-2xl shadow-brutal-xl",
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-3 border-ink bg-butter px-5 py-3 rounded-t-[13px] sticky top-0 z-10">
              <h2 className="font-display text-base uppercase tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="border-2 border-ink rounded-lg bg-cream p-1 shadow-brutal-sm hover:bg-flamingo transition-colors"
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