"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { WalletWidget } from "../WalletWidget";
import { Logo } from "../logo";
import { Button } from "../ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSessionRestore } from "@/hooks/useSessionRestore";
import { MobileNavDrawer } from "./MobileNavDrawer";

export function Navbar() {
  useSessionRestore();
  const pathname = usePathname();
  const { token } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b-3 border-ink bg-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="font-display text-xl font-black uppercase tracking-tight">
            Mergepay
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 font-bold text-sm">
          <Link
            href="/dashboard"
            className={pathname?.startsWith("/dashboard") ? "text-ink underline decoration-3" : "text-ink/60 hover:text-ink"}
          >
            Dashboard
          </Link>
          <Link
            href="/groups"
            className={pathname?.startsWith("/groups") ? "text-ink underline decoration-3" : "text-ink/60 hover:text-ink"}
          >
            Groups
          </Link>
          <Link
            href="/history"
            className={pathname?.startsWith("/history") ? "text-ink underline decoration-3" : "text-ink/60 hover:text-ink"}
          >
            History
          </Link>
          <Link
            href="/anchors"
            className={pathname?.startsWith("/anchors") ? "text-ink underline decoration-3" : "text-ink/60 hover:text-ink"}
          >
            Anchors
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <WalletWidget />
        </div>
      </div>
      <MobileNavDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </header>
  );
}
