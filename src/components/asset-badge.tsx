import { cn } from "@/lib/utils";

export function AssetBadge({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const isNative = code === "XLM";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border-2 border-ink px-2 py-0.5 font-display text-[10px] uppercase tracking-widest shadow-brutal-sm",
        isNative ? "bg-ink text-lime" : "bg-aqua text-ink",
        className
      )}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
        <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" />
      </svg>
      {code}
    </span>
  );
}
