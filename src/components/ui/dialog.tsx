"use client";

import * as React from "react";
import { useRef, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { useDialogFocus } from "./useDialogFocus";

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
  const contentRef = useRef<HTMLDivElement>(null);

  const titleId = useId();
  const descriptionId = useId();

  useDialogFocus({ open, onClose, panelRef: dialogRef, contentRef, dismissible });

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

        {/* `contentRef` is what the focus rules read; the matching attribute
            stays as a stable hook for styling and tests. */}
        <div className="pt-4" data-dialog-content ref={contentRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
