"use client";

import { createContext, useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

// `next/dynamic` gives its `loading` component no props, so the fallback the
// caller chose reaches it through context.
const LottieFallbackContext = createContext<React.ReactNode>(null);

function LottieLoading() {
  return <>{useContext(LottieFallbackContext)}</>;
}

// The player (lottie-web) is the heaviest thing on the landing page and needs
// `document`, so it loads in its own chunk, in the browser only (#707).
const Lottie = dynamic(() => import("lottie-react"), {
  ssr: false,
  loading: LottieLoading,
});

/**
 * Renders a locally-hosted Lottie JSON animation (from /public/lottie).
 * The JSON is fetched at runtime and the player is code-split, so neither is in
 * the initial bundle. Until both have arrived — or if either fails — we show a
 * neobrutalist SVG fallback in the same box, so the surface is never empty and
 * nothing shifts when the animation takes over.
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
  const [data, setData] = useState<unknown>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not ok"))))
      .then((json) => active && setData(json))
      .catch(() => active && setFailed(true));
    // Fetch the player chunk alongside the JSON rather than after it; the
    // `dynamic` component above then resolves from the module cache.
    import("lottie-react")
      .then(() => active && setPlayerReady(true))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [src]);

  const fallbackNode = fallback ?? <CoinsIllustration />;
  const ready = Boolean(data) && playerReady && !failed;

  return (
    <div
      className={cn("relative", className)}
      role="img"
      aria-label={label}
      aria-busy={!ready && !failed ? true : undefined}
    >
      <LottieFallbackContext.Provider value={fallbackNode}>
        {ready ? (
          <Lottie
            animationData={data as object}
            loop
            autoplay
            style={{ width: "100%", height: "100%" }}
            rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
          />
        ) : (
          fallbackNode
        )}
      </LottieFallbackContext.Provider>
    </div>
  );
}

/** Hand-drawn style fallback: stacked coins with a star. */
export function CoinsIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 160"
      fill="none"
      className={cn("h-full w-full", className)}
      aria-hidden
    >
      <ellipse cx="100" cy="130" rx="70" ry="14" fill="#18130E" opacity="0.15" />
      <rect x="40" y="84" width="76" height="40" rx="12" fill="#6C4DF6" stroke="#18130E" strokeWidth="4" />
      <rect x="56" y="62" width="76" height="40" rx="12" fill="#FF8A3C" stroke="#18130E" strokeWidth="4" />
      <rect x="72" y="40" width="76" height="40" rx="12" fill="#D7F94B" stroke="#18130E" strokeWidth="4" />
      <path d="M165 18 L169 30 L181 34 L169 38 L165 50 L161 38 L149 34 L161 30 Z" fill="#FFF9EC" stroke="#18130E" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M30 24 L33 32 L41 35 L33 38 L30 46 L27 38 L19 35 L27 32 Z" fill="#FF5D8F" stroke="#18130E" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

export const LOTTIE = {
  coins: "/lottie/coins.json",
  paymentHands: "/lottie/payment-hands.json",
};
