import { cn } from "@/lib/utils";

export function Marquee({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  const doubled = [...items, ...items];
  return (
    <div className={cn("overflow-hidden border-y-3 border-ink bg-ink py-3", className)}>
      <div className="flex w-max animate-marquee gap-8">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-8 font-display text-sm uppercase tracking-widest text-lime"
          >
            {item}
            <svg width="16" height="16" viewBox="0 0 10 10" fill="#FF8A3C" aria-hidden>
              <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" />
            </svg>
          </span>
        ))}
      </div>
    </div>
  );
}
