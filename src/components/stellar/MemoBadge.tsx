"use client";

import { AlertTriangle, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { parseMemo } from "@/lib/memo";

/**
 * Neobrutalist badge that verifies the `MP:<code>` memo on an on-chain
 * payment.
 *
 * A valid memo gets a lime "Verified memo" chip carrying the expense
 * reference; anything else is flagged flamingo as "Check memo" so a user can
 * tell at a glance whether a transfer is bound to the expense it claims.
 * Renders nothing when there is no memo, so it can be dropped into any
 * transaction row unconditionally.
 *
 * The status is exposed as both `data-memo-status` and an `aria-label` —
 * the colour is decoration, not the only signal.
 */
export function MemoBadge({
  memo,
  className,
}: {
  memo: string | null | undefined;
  className?: string;
}) {
  const parsed = parseMemo(memo);
  if (!parsed) return null;

  const valid = parsed.status === "valid";
  const label = valid ? "Verified memo" : "Check memo";

  return (
    <Badge
      tone={valid ? "lime" : "flamingo"}
      className={cn("gap-1.5", className)}
      data-memo-status={parsed.status}
      title={parsed.detail}
      aria-label={`${label}: ${parsed.detail}`}
    >
      {valid ? (
        <BadgeCheck className="h-3 w-3" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      )}
      <span>{label}</span>
      {parsed.code && (
        <code className="font-mono text-[10px] normal-case tracking-normal">
          {parsed.code}
        </code>
      )}
    </Badge>
  );
}
