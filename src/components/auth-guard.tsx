"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { LogoMark } from "./logo";

/** Client-side guard: redirects to /login when there is no session. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, hydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  if (!hydrated || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="animate-wiggle">
          <LogoMark size={56} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
