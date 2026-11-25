import React from "react";
import Link from "next/link";

export function MobileNav() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="flex justify-around items-center h-16 w-full fixed bottom-0 z-40 bg-paper border-t-3 border-ink sm:hidden"
    >
      <Link
        href="/"
        className="min-h-12 min-w-12 flex items-center justify-center px-3 py-2 font-bold text-sm text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40 rounded-lg"
      >
        Home
      </Link>
      <Link
        href="/dashboard"
        className="min-h-12 min-w-12 flex items-center justify-center px-3 py-2 font-bold text-sm text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40 rounded-lg"
      >
        Dashboard
      </Link>
      <Link
        href="/settings"
        className="min-h-12 min-w-12 flex items-center justify-center px-3 py-2 font-bold text-sm text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40 rounded-lg"
      >
        Settings
      </Link>
    </nav>
  );
}
