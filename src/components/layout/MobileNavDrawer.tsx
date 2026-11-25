"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Before this the drawer only listened for Escape: focus stayed on the
  // hamburger behind the backdrop, Tab walked straight out to the page the
  // drawer was covering, and closing left focus on a now-unmounted element.
  useDialogFocus({ open, onClose, panelRef });

  // Close on route change (#619). The link onClicks below cover the happy
  // path, but a back/forward navigation, a deep link or any programmatic
  // redirect changes the page underneath without ever firing them, leaving
  // the drawer covering a route it was never opened for. The latest `open`
  // and `onClose` are read through refs so this effect belongs to
  // `pathname` alone: with `open` as a dependency it would close the drawer
  // the moment it opened.
  const openRef = useRef(open);
  openRef.current = open;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (openRef.current) onCloseRef.current();
  }, [pathname]);

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/groups", label: "Groups" },
    { href: "/history", label: "History" },
    { href: "/anchors", label: "Anchors" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/50 z-50 md:hidden"
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            id="mobile-nav-drawer"
            className="fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-paper border-r-3 border-ink z-50 md:hidden outline-none"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
          >
            <div className="flex items-center justify-between p-4 border-b-3 border-ink">
              <span className="font-display text-xl font-black uppercase tracking-tight">
                Mergepay
              </span>
              <button
                onClick={onClose}
                className="min-h-11 min-w-11 flex items-center justify-center p-2 hover:bg-ink/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
                aria-label="Close navigation"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="p-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`block px-4 py-3 rounded-lg font-bold text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40 ${
                    pathname?.startsWith(item.href)
                      ? "bg-ink text-paper"
                      : "text-ink hover:bg-ink/10"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
