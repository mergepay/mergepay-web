"use client";

import { AlertTriangle, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { breakdownMemo } from "@/lib/memoValidation";
import { verifyTransactionMemo, type MemoSeverity } from "@/lib/memo";

/** Badge tone/label for every memo state that is worth rendering. */
const PRESENTATION: Record<
  Exclude<MemoSeverity, "missing">,
  { tone: "lime" | "butter" | "flamingo"; label: string }
> = {
  none: { tone: "lime", label: "Verified memo" },
  deviation: { tone: "butter", label: "Unverified memo" },
  malformed: { tone: "flamingo", label: "Check memo" },
  invalid_length: { tone: "flamingo", label: "Check memo" },
};

/**
 * Compact neobrutalist badge that verifies the `MP:<code>` memo on an
 * on-chain payment.
 *
 * A conformant memo gets a lime "Verified memo" chip carrying its expense
 * reference; a malformed or oversized memo is flagged in flamingo as "Check
 * memo"; a code that deviates from the expected value is a softer butter
 * "Unverified memo". Nothing renders when there is no memo, so the badge can
 * be dropped into any transaction row unconditionally.
 *
 * Verification itself lives in `@/lib/memo` (shared with the pre-sign
 * `MemoWarningBanner`), so history and settlement flows never disagree about
 * whether a memo is good. The colour is decoration: the status is also
 * exposed through `data-memo-status` and an `aria-label`.
 */
export function MemoBadge({
  memo,
  expectedShortCode,
  className,
}: {
  memo: string | null | undefined;
  /** Expected expense short code, used to flag a memo that deviates. */
  expectedShortCode?: string | null;
  className?: string;
}) {
  // Normalize once so verification and the breakdown agree on the value.
  const trimmed = typeof memo === "string" ? memo.trim() : "";
  const verification = verifyTransactionMemo(
    trimmed,
    expectedShortCode ?? undefined
  );

  // No memo at all — there is nothing to verify, so render nothing.
  if (verification.severity === "missing") return null;

  const { tone, label } = PRESENTATION[verification.severity];
  const breakdown = breakdownMemo(trimmed);
  const code = breakdown.conformsToConvention ? breakdown.shortCode : null;
  const Icon = verification.severity === "none" ? BadgeCheck : AlertTriangle;

  return (
    <Badge
      tone={tone}
      className={cn("gap-1.5", className)}
      data-memo-status={verification.severity}
      title={verification.message}
      aria-label={`${label}: ${verification.message}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
      {code && (
        <code className="font-mono text-[10px] normal-case tracking-normal">
          {code}
        </code>
      )}
    </Badge>
  );
}
