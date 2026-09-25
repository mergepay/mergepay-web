"use client";

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

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/anchors", label: "Anchors", icon: Banknote },
  { href: "/history", label: "Activity", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t-3 border-ink bg-paper py-1 px-2 shadow-brutal-lg lg:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 transition-all text-xs font-display uppercase tracking-wider",
              active
                ? "border-2 border-ink bg-grape text-white shadow-brutal-sm font-bold scale-105"
                : "text-ink/70 hover:text-ink hover:bg-cream"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
