"use client";

import React, { useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "./useDialogFocus";

export interface FocusTrapModalProps {
  children: React.ReactNode;
  onClose: () => void;
  open?: boolean;
  title?: string;
  description?: string;
  dismissible?: boolean;
  className?: string;
}

export function FocusTrapModal({
  children,
  onClose,
  open = true,
  title,
  description,
  dismissible = true,
  className,
}: FocusTrapModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useDialogFocus({
    open,
    onClose,
    panelRef: modalRef,
    contentRef,
    dismissible,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-ink/60 backdrop-blur-sm transition-opacity"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl border-3 border-ink bg-paper p-6 shadow-brutal outline-none",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between pb-4 border-b-2 border-ink">
            <h2 id={titleId} className="font-display text-lg uppercase tracking-wider">
              {title}
            </h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                className="min-h-8 min-w-8 flex items-center justify-center rounded-lg p-1 hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {description && (
          <p id={descriptionId} className="mt-2 text-sm text-ink/70">
            {description}
          </p>
        )}
        <div ref={contentRef} data-dialog-content className={title ? "pt-4" : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}
