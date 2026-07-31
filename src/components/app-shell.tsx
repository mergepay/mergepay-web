"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { Badge } from "./ui/badge";
import { WalletDisconnectedBanner } from "./layout/wallet-disconnected-banner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useWalletScopedCache } from "@/lib/queries";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { WalletStatusPanel } from "./wallet/wallet-status";
import { shortKey } from "@/lib/format";
import { FOCUSABLE_SELECTOR, nextFocusIndex } from "@/lib/dialog";

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
  const { user, logout } = useAuth();
  const { refresh: refreshWallet, ...walletStatus } = useWalletStatus();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // Trap focus inside mobile drawer and handle Escape to close.
  useEffect(() => {
    if (!mobileOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMobileOpen(false);
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

    // Focus the first focusable element in the drawer after mount.
    const frame = requestAnimationFrame(() => {
      const focusable = getDrawerFocusable();
      if (focusable.length > 0) focusable[0]?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown, true);
      // Restore focus to the trigger when the drawer closes.
      previousFocusRef.current?.focus();
    };
  }, [mobileOpen, getDrawerFocusable]);

  // Group content must never survive a switch to a different wallet.
  useWalletScopedCache();

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
      <div className="px-3 pb-3">
        <WalletStatusPanel status={walletStatus} onRefresh={refreshWallet} />
      </div>
      {user && (
        <div className="border-t-3 border-ink p-3">
          <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-cream px-3 py-2.5">
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-sm">{user.displayName}</p>
              <p
                className="truncate font-mono text-[11px] text-ink/50"
                aria-hidden="true"
              >
                {shortKey(user.stellarPublicKey, 5)}
              </p>
              <span className="sr-only">
                Signed in as {user.displayName}, Stellar address{" "}
                {user.stellarPublicKey}
              </span>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              className="rounded-lg border-2 border-ink bg-paper p-1.5 shadow-brutal-sm hover:bg-flamingo transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
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
        <div className="flex items-center gap-2">
          {/* Mirrors the sidebar panel so the wallet state is visible on mobile
              without opening the drawer. */}
          <Badge tone={walletStatus.tone}>{walletStatus.label}</Badge>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-xl border-3 border-ink bg-cream p-2 shadow-brutal-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0 bg-ink/60"
            onClick={() => setMobileOpen(false)}
          />
          <div
            ref={drawerRef}
            className="absolute inset-y-0 left-0 flex w-72 flex-col border-r-3 border-ink bg-paper"
          >
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-4 rounded-lg border-2 border-ink bg-cream p-1.5 shadow-brutal-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        {/* Persistent reconnect prompt while the Freighter wallet is
            disconnected; also hosts the connection poll. */}
        <WalletDisconnectedBanner />
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
