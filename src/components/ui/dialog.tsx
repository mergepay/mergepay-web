"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusTimer = window.setTimeout(() => {
      const autofocusEl = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      if (autofocusEl) {
        autofocusEl.focus();
      } else {
        panelRef.current?.focus();
      }
    }, 50);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab") {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [input]:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [open]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          closeRef.current();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-desc" : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border-3 border-ink bg-paper shadow-brutal-xl focus:outline-none",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-3 border-ink bg-butter px-6 py-4 rounded-t-[13px]">
          <div className="space-y-0.5 pr-8">
            <h3
              id="dialog-title"
              className="font-display text-lg uppercase tracking-tight"
            >
              {title}
            </h3>
            {description && (
              <p id="dialog-desc" className="text-xs text-ink/60">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={closeRef.current}
            aria-label="Close dialog"
            className="absolute right-4 top-4 border-2 border-ink rounded-lg bg-cream p-1.5 shadow-brutal-sm hover:bg-flamingo transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
