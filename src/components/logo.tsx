import { cn } from "@/lib/utils";

/**
 * Mergepay mark: two coins merging — grape + lime — with a four-point
 * Stellar-style star where they overlap. Bold ink outlines, hard shadow.
 */
export function LogoMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* hard shadow */}
      <rect x="8" y="10" width="36" height="36" rx="10" fill="#18130E" />
      <rect x="24" y="22" width="36" height="36" rx="18" fill="#18130E" />
      {/* grape square coin */}
      <rect
        x="4"
        y="6"
        width="36"
        height="36"
        rx="10"
        fill="#6C4DF6"
        stroke="#18130E"
        strokeWidth="3.5"
      />
      {/* lime round coin */}
      <rect
        x="20"
        y="18"
        width="36"
        height="36"
        rx="18"
        fill="#D7F94B"
        stroke="#18130E"
        strokeWidth="3.5"
      />
      {/* overlap: four-point star (Stellar nod) */}
      <path
        d="M31 22 L34.2 31.8 L44 35 L34.2 38.2 L31 48 L27.8 38.2 L18 35 L27.8 31.8 Z"
        fill="#FFF9EC"
        stroke="#18130E"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  markSize = 36,
  text = true,
}: {
  className?: string;
  markSize?: number;
  text?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize} />
      {text && (
        <span className="font-display text-xl tracking-tight leading-none">
          MERGE
          <span className="text-grape">PAY</span>
        </span>
      )}
    </span>
  );
}
