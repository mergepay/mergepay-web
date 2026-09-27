"use client";

/**
 * Mobile bottom navigation (#542).
 *
 * On small viewports the desktop sidebar is hidden, so this bar is the only
 * persistent way to move between the top-level views. It is fixed to the
 * viewport bottom and hidden from `lg` upward, where the sidebar returns.
 *
 * Three mobile-specific details are load-bearing:
 *  - `env(safe-area-inset-bottom)` keeps the row above the home indicator on
 *    phones with a gesture bar instead of underneath it.
 *  - every item is at least 48×48px so it meets the minimum touch-target
 *    guidance (WCAG 2.5.8 / Apple HIG) rather than being furiously tappable
 *    only by people with small fingers.
 *  - the current route is announced with `aria-current="page"` so the active
 *    state is not conveyed by colour alone.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  History,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/anchors", label: "Anchors", icon: Banknote },
  { href: "/history", label: "Activity", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Whether `href` is the active route. A nested page (`/groups/g1`) keeps its
 * section (`/groups`) highlighted; `/dashboard` is intentionally an exact
 * match because it is the parent of nothing.
 */
export function isBottomNavItemActive(
  pathname: string | null | undefined,
  href: string
): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      data-testid="bottom-nav"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t-3 border-ink bg-paper shadow-brutal-lg",
        // Stay clear of the home indicator / gesture bar.
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="flex items-stretch justify-around gap-1 px-2 py-1">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const active = isBottomNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 48×48px minimum touch target.
                  "flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5",
                  "rounded-xl border-2 px-2 py-1.5 text-xs font-display uppercase tracking-wider",
                  "transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40",
                  active
                    ? "border-ink bg-grape font-bold text-white shadow-brutal-sm"
                    : "border-transparent text-ink/70 hover:bg-cream hover:text-ink"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-[10px]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
