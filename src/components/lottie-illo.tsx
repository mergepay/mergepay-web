"use client";

import { useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { cn } from "@/lib/utils";

/**
 * LottieFiles illustration with a graceful neobrutalist SVG fallback when the
 * animation cannot load (offline, blocked CDN, etc.).
 */
export function LottieIllo({
  src,
  className,
  fallback,
  label,
}: {
  src: string;
  className?: string;
  fallback?: React.ReactNode;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed && fallback) return <>{fallback}</>;

  return (
    <div className={cn("relative", className)} role="img" aria-label={label}>
      <DotLottieReact
        src={src}
        loop
        autoplay
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%" }}
      />
      {failed && !fallback && <CoinsIllustration className="absolute inset-0" />}
    </div>
  );
}

/** Hand-drawn style fallback: stacked coins with a star. */
export function CoinsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 160" fill="none" className={cn("w-full h-full", className)} aria-hidden>
      <ellipse cx="100" cy="130" rx="70" ry="14" fill="#18130E" opacity="0.15" />
      <rect x="40" y="84" width="76" height="40" rx="12" fill="#6C4DF6" stroke="#18130E" strokeWidth="4" />
      <rect x="56" y="62" width="76" height="40" rx="12" fill="#FF8A3C" stroke="#18130E" strokeWidth="4" />
      <rect x="72" y="40" width="76" height="40" rx="12" fill="#D7F94B" stroke="#18130E" strokeWidth="4" />
      <path d="M165 18 L169 30 L181 34 L169 38 L165 50 L161 38 L149 34 L161 30 Z" fill="#FFF9EC" stroke="#18130E" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M30 24 L33 32 L41 35 L33 38 L30 46 L27 38 L19 35 L27 32 Z" fill="#FF5D8F" stroke="#18130E" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
