import { cn } from "@/lib/utils";
import {
  TIMESTAMP_FALLBACK,
  TIMESTAMP_FALLBACK_FULL,
  describeTimestamp,
} from "@/lib/datetime";

export type TimestampMode = "absolute" | "relative";

/**
 * Renders an API timestamp with one convention across the app.
 *
 * The visible text stays compact enough for narrow screens, while the
 * full date, time and zone are always available — as the element's
 * accessible name and as its hover title. `mode="relative"` shows a
 * relative label but still carries the exact timestamp underneath, which
 * matters for financial records.
 *
 * An unparseable or missing value renders a plain fallback instead of a
 * `<time>` element, since there would be no valid `datetime` to emit.
 */
export function Timestamp({
  value,
  mode = "absolute",
  className,
  prefix,
}: {
  value: string | null | undefined;
  mode?: TimestampMode;
  className?: string;
  /** Optional lead-in included in the accessible name, e.g. "Joined". */
  prefix?: string;
}) {
  const described = describeTimestamp(value);
  const label = prefix ? `${prefix} ${described.full}` : described.full;

  if (!described.valid || !described.machine) {
    return (
      <span className={className} title={TIMESTAMP_FALLBACK_FULL}>
        <span aria-hidden="true">{TIMESTAMP_FALLBACK}</span>
        <span className="sr-only">{TIMESTAMP_FALLBACK_FULL}</span>
      </span>
    );
  }

  const visible = mode === "relative" ? described.relative : described.short;

  return (
    <time
      dateTime={described.machine}
      title={described.full}
      className={cn("whitespace-nowrap", className)}
      // Prerendering happens in the server's zone and hydration in the
      // reader's; the `datetime` attribute carries the canonical value,
      // so the rendered text is allowed to differ.
      suppressHydrationWarning
    >
      {/* Hidden from assistive tech so the abbreviated form is not read
          alongside the full label below it. */}
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{label}</span>
    </time>
  );
}
