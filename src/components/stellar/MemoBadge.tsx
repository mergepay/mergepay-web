"use client";

/**
 * MemoBadge (#373)
 *
 * Compact, accessible badge that inspects a Stellar transaction memo against
 * the Mergepay `MP:<code>` reconciliation convention and renders a clear
 * visual distinction between valid, missing, malformed, over-long, and
 * deviating memos.
 *
 * It is intentionally lightweight and strictly typed: every decision routes
 * through `verifyTransactionMemo` in `src/lib/memo.ts`, so the badge can never
 * disagree with the pre-signing `MemoWarningBanner`.
 *
 * Used by the expense list item (`expense-card.tsx`) and the ledger timeline
 * (`ledger-panel.tsx`) — the transaction history views users audit.
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  verifyTransactionMemo,
  SETTLEMENT_MEMO_PREFIX,
  type MemoSeverity,
} from "@/lib/memo";

type BadgeTone = "grape" | "lime" | "tangerine" | "flamingo" | "aqua" | "butter" | "ink" | "paper";

interface SeverityMeta {
  tone: BadgeTone;
  label: string;
  icon: LucideIcon;
}

/**
 * Visual treatment per verification severity. The label always states the
 * outcome in words, so the badge stays readable without relying on colour.
 */
const SEVERITY_META: Record<MemoSeverity, SeverityMeta> = {
  none: { tone: "lime", label: "Verified", icon: CheckCircle2 },
  missing: { tone: "paper", label: "No memo", icon: MinusCircle },
  malformed: { tone: "flamingo", label: "Invalid", icon: AlertCircle },
  invalid_length: { tone: "flamingo", label: "Too long", icon: AlertTriangle },
  deviation: { tone: "butter", label: "Mismatch", icon: AlertTriangle },
};

export interface MemoBadgeProps {
  /** Raw memo attached to the transaction. `null`/`undefined` = no memo. */
  memo: string | null | undefined;
  /**
   * Expected reconciliation short code (the expense reference). When given, a
   * structurally valid memo whose code differs is flagged as a deviation.
   */
  expectedShortCode?: string | null;
  /** Hide the short code and render only the verification label. */
  compact?: boolean;
  className?: string;
}

/** The code portion of a memo, whether or not it carries the `MP:` prefix. */
function extractShortCode(memo: string | null | undefined): string {
  const trimmed = memo?.trim() ?? "";
  return trimmed.startsWith(SETTLEMENT_MEMO_PREFIX)
    ? trimmed.slice(SETTLEMENT_MEMO_PREFIX.length)
    : trimmed;
}

export function MemoBadge({
  memo,
  expectedShortCode,
  compact = false,
  className,
}: MemoBadgeProps) {
  const result = verifyTransactionMemo(memo, expectedShortCode ?? undefined);
  const meta = SEVERITY_META[result.severity];
  const Icon = meta.icon;
  const shortCode = extractShortCode(memo);

  return (
    <Badge
      tone={meta.tone}
      className={cn("font-mono normal-case tracking-normal", className)}
      title={`${result.title} — ${result.message}`}
      aria-label={`Memo verification: ${result.title}. ${result.message}`}
      data-testid="memo-badge"
      data-severity={result.severity}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span className="font-display uppercase tracking-widest">{meta.label}</span>
      {!compact && shortCode && (
        <code className="font-mono text-[10px] normal-case tracking-normal opacity-80">
          {shortCode}
        </code>
      )}
    </Badge>
  );
}
