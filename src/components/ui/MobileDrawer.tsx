"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dialogStack,
  FOCUSABLE_SELECTOR,
  pickInitialFocusIndex,
  nextFocusIndex,
  shouldCloseOnEscape,
} from "@/lib/dialog";

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
  const drawerId = "mobile-drawer"; // Fixed ID for stack tracking

  // Get focusable elements inside the drawer content (excluding header)
  const getContentFocusable = useCallback(() => {
    if (!drawerRef.current) return [];
    const content = drawerRef.current.querySelector('[class*="flex-1"]');
    if (!content) return [];
    return Array.from(
      content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.tabIndex !== -1);
  }, []);

  // Get all focusable elements (including header) for focus trapping
  const getAllFocusable = useCallback(() => {
    if (!drawerRef.current) return [];
    return Array.from(
      drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.tabIndex !== -1);
  }, []);

  // Trap focus and handle Escape
  useEffect(() => {
    if (!open) return;

    // Register this drawer in the dialog stack
    dialogStack.push(drawerId);
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    function handleKeyDown(e: KeyboardEvent) {
      if (shouldCloseOnEscape({ key: e.key, dismissible, isTopmost: dialogStack.isTopmost(drawerId) })) {
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

    window.addEventListener("keydown", handleKeyDown, true);

    const frame = requestAnimationFrame(() => {
      const focusable = getContentFocusable();
      if (focusable.length === 0) {
        // Fallback to all focusable if no content focusable
        const allFocusable = getAllFocusable();
        if (allFocusable.length === 0) return;

        const candidates = allFocusable.map((el) => ({
          autofocus: el.hasAttribute("data-autofocus"),
          inBody: !el.closest('[class*="border-b"], [class*="border-r"], [class*="border-l"]'),
        }));

        const initialIndex = pickInitialFocusIndex(candidates);
        allFocusable[initialIndex]?.focus();
        return;
      }

      // Build candidates for initial focus selection - all in content are "in body"
      const candidates = focusable.map((el) => ({
        autofocus: el.hasAttribute("data-autofocus"),
        inBody: true,
      }));

      const initialIndex = pickInitialFocusIndex(candidates);
      focusable[initialIndex]?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown, true);
      dialogStack.remove(drawerId);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose, dismissible, getContentFocusable, getAllFocusable, drawerId]);

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

  const titleId = title ? `drawer-title-${drawerId}` : undefined;

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
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
                <h2 id={titleId} className="font-display text-sm uppercase tracking-widest pr-8">
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
