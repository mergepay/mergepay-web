"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUSABLE_SELECTOR, nextFocusIndex } from "@/lib/dialog";

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
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getDrawerFocusable = useCallback(
    () =>
      drawerRef.current
        ? Array.from(
            drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
          ).filter((el) => el.tabIndex !== -1)
        : [],
    []
  );

  // Trap focus and handle Escape
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getDrawerFocusable();
      if (focusable.length === 0) return;
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

    const frame = requestAnimationFrame(() => {
      const focusable = getDrawerFocusable();
      if (focusable.length > 0) focusable[0]?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown, true);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose, dismissible, getDrawerFocusable]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
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
            variants={slideVariants[side]}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "absolute flex flex-col border-3 border-ink bg-paper shadow-brutal-lg",
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
                <h2 className="font-display text-sm uppercase tracking-widest pr-8">
                  {title}
                </h2>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
