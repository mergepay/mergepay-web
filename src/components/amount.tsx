import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/format";

/**
 * Signed amount with semantic color: green-ish (lime-dark) when positive
 * (you are owed), flamingo when negative (you owe).
 */
export function NetAmount({
  value,
  assetCode,
  className,
}: {
  value: string | number;
  assetCode: string;
  className?: string;
}) {
  const n = typeof value === "number" ? value : parseFloat(value);
  const positive = n > 0.0000001;
  const negative = n < -0.0000001;
  return (
    <span
      className={cn(
        "font-mono font-bold tabular-nums",
        positive && "text-lime-dark",
        negative && "text-flamingo",
        !positive && !negative && "text-ink/50",
        className
      )}
    >
      {positive ? "+" : ""}
      {formatAmount(n)} {assetCode}
    </span>
  );
}

export function Money({
  value,
  assetCode,
  className,
}: {
  value: string | number;
  assetCode: string;
  className?: string;
}) {
  return (
    <span className={cn("font-mono font-bold tabular-nums", className)}>
      {formatAmount(value)} {assetCode}
    </span>
  );
}
