"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Logo, LogoMark } from "./logo";
import { Avatar } from "./ui/avatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { logout } from "@/lib/stellar";
import { shortKey } from "@/lib/format";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/anchors", label: "Anchors", icon: Banknote },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    toast.success("Signed out");
    router.replace("/login");
  }

  const navContent = (
    <>
      <div className="px-4 py-5">
        <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
          <Logo />
        </Link>
      </div>
      <nav className="flex-1 space-y-1.5 px-3">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 font-display text-sm uppercase tracking-wide transition-all duration-100",
                active
                  ? "border-ink bg-grape text-white shadow-brutal-sm"
                  : "border-transparent text-ink/70 hover:border-ink hover:bg-cream"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="border-t-3 border-ink p-3">
          <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-cream px-3 py-2.5">
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-sm">{user.displayName}</p>
              <p className="truncate font-mono text-[11px] text-ink/50">
                {shortKey(user.stellarPublicKey, 5)}
              </p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              className="rounded-lg border-2 border-ink bg-paper p-1.5 shadow-brutal-sm hover:bg-flamingo transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r-3 border-ink bg-paper lg:flex">
        {navContent}
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b-3 border-ink bg-paper px-4 py-3 lg:hidden">
        <Link href="/dashboard">
          <Logo markSize={30} />
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-xl border-3 border-ink bg-cream p-2 shadow-brutal-sm"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r-3 border-ink bg-paper">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded-lg border-2 border-ink bg-cream p-1.5 shadow-brutal-sm"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 font-display text-xs uppercase tracking-widest text-ink/60 hover:text-grape"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-xl text-ink/60">{description}</p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}
