import { cn } from "@/lib/utils";
import { formatAssetAmount, type FormatAmountOptions } from "@/lib/currency";

interface AmountProps {
  value: string | number | null | undefined;
  assetCode: string | null | undefined;
  className?: string;
  /** Precision/locale overrides. Rarely needed — see `lib/currency.ts`. */
  format?: FormatAmountOptions;
}

/**
 * Amount + asset, rendered once for sighted users and once for assistive
 * technology.
 *
 * The visible node is hidden from the accessibility tree so a screen
 * reader never has to interpret grouping separators or a bare `—`; it
 * announces the formatter's label instead, which always names the asset
 * (or says the amount is unavailable).
 */
function AmountText({
  amount,
  className,
}: {
  amount: ReturnType<typeof formatAssetAmount>;
  className?: string;
}) {
  return (
    <span className={className}>
      <span aria-hidden="true">{amount.text}</span>
      <span className="sr-only">{amount.label}</span>
    </span>
  );
}

/**
 * Signed amount with semantic color: green-ish (lime-dark) when positive
 * (you are owed), flamingo when negative (you owe).
 */
export function NetAmount({ value, assetCode, className, format }: AmountProps) {
  const amount = formatAssetAmount(value, assetCode, {
    signDisplay: "always",
    ...format,
  });
  const positive = amount.amount.startsWith("+");
  const negative = amount.amount.startsWith("-");

  return (
    <AmountText
      amount={amount}
      className={cn(
        "font-mono font-bold tabular-nums",
        positive && "text-lime-dark",
        negative && "text-flamingo",
        !positive && !negative && "text-ink/50",
        className
      )}
    />
  );
}

export function Money({ value, assetCode, className, format }: AmountProps) {
  return (
    <AmountText
      amount={formatAssetAmount(value, assetCode, format)}
      className={cn("font-mono font-bold tabular-nums", className)}
    />
  );
}
