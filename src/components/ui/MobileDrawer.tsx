"use client";

import { useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "./useDialogFocus";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** Side from which the drawer slides in. Default "bottom" for mobile. */
  side?: "bottom" | "left" | "right";
  /** When false, backdrop clicks and Escape are disabled. */
  dismissible?: boolean;
}

export function MobileDrawer({
  open,
  onClose,
  title,
  children,
  className,
  side = "bottom",
  dismissible = true,
}: MobileDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const generatedTitleId = useId();

  useDialogFocus({ open, onClose, panelRef: drawerRef, contentRef, dismissible });

  const slideVariants = {
    bottom: {
      initial: { y: "100%" },
      animate: { y: 0 },
      exit: { y: "100%" },
    },
    left: {
      initial: { x: "-100%" },
      animate: { x: 0 },
      exit: { x: "-100%" },
    },
    right: {
      initial: { x: "100%" },
      animate: { x: 0 },
      exit: { x: "100%" },
    },
  };

  const positionClasses = {
    bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl",
    left: "inset-y-0 left-0 w-72 border-r-3",
    right: "inset-y-0 right-0 w-72 border-l-3",
  };

  // A titled drawer labels its dialog; an untitled one keeps its close button
  // as the only accessible name source and stays unnamed rather than pointing
  // aria-labelledby at an <h2> that is not rendered.
  const titleId = title ? generatedTitleId : undefined;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute inset-0 bg-ink/60 backdrop-blur-sm",
              !dismissible && "pointer-events-none"
            )}
            onClick={dismissible ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            // Focus is parked here when there is nothing to Tab to; a div
            // without tabIndex cannot receive it and the trap silently misses.
            tabIndex={-1}
            variants={slideVariants[side]}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "absolute flex flex-col border-3 border-ink bg-paper shadow-brutal-lg outline-none",
              positionClasses[side],
              className
            )}
          >
            {/* Close button */}
            {dismissible && (
              <button
                onClick={onClose}
                aria-label="Close drawer"
                className="absolute right-3 top-3 z-10 rounded-lg border-2 border-ink bg-cream p-1.5 shadow-brutal-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Header */}
            {title && (
              <div className="border-b-3 border-ink px-4 py-3">
                <h2 id={titleId} className="font-display text-sm uppercase tracking-widest pr-8">
                  {title}
                </h2>
              </div>
            )}

            {/* Content — the ref marks the body initial focus prefers, so the
                rule does not depend on this div's classes. */}
            <div className="flex-1 overflow-y-auto p-4" ref={contentRef}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
