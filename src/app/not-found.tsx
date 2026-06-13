import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper p-6 dotted-bg text-center">
      <Logo markSize={44} />
      <h1 className="font-display text-7xl uppercase tracking-tight text-grape">404</h1>
      <p className="max-w-sm text-ink/60">
        This page drifted off into the Stellar network. Let&apos;s get you back.
      </p>
      <Link href="/dashboard">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
