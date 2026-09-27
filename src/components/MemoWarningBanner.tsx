"use client";

/**
 * MemoWarningBanner
 *
 * Prominent neobrutalist alert banner that warns users before signing or submitting
 * Stellar transactions if the required Mergepay reconciliation memo (`MP:<code>`)
 * is missing, malformed, exceeds byte capacity, or deviates from expected codes.
 *
 * Adheres to accessibility requirements with `role="alert"`, `aria-live="assertive"`,
 * and `aria-atomic="true"`.
 */

import { AlertTriangle, AlertCircle, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  verifyTransactionMemo,
  type MemoVerificationResult,
  type MemoSeverity,
  STELLAR_MEMO_MAX_BYTES,
} from "@/lib/memo";

export interface MemoWarningBannerProps {
  /** The memo string currently entered or configured for the transaction. */
  memo?: string | null;
  /** Expected expense short code (optional) to flag deviation warnings. */
  expectedShortCode?: string | null;
  /** Callback fired when user chooses to apply the recommended/fixed memo. */
  onFixMemo?: (suggestedMemo: string) => void;
  /** Optional custom class names for the container. */
  className?: string;
  /** Force display even if valid (defaults to false). */
  alwaysShow?: boolean;
}

export function MemoWarningBanner({
  memo,
  expectedShortCode,
  onFixMemo,
  className = "",
  alwaysShow = false,
}: MemoWarningBannerProps) {
  const result: MemoVerificationResult = verifyTransactionMemo(
    memo,
    expectedShortCode ?? undefined
  );

  // If the memo is completely valid and we do not force display, render nothing
  if (result.severity === "none" && !alwaysShow) {
    return null;
  }

  // Determine neobrutalist theme styling based on severity level
  const isCritical =
    result.severity === "missing" ||
    result.severity === "malformed" ||
    result.severity === "invalid_length";

  const bannerBg = isCritical ? "bg-flamingo-pale" : "bg-butter-pale";
  const iconBg = isCritical ? "text-flamingo" : "text-tangerine-dark";

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`rounded-xl border-3 border-ink ${bannerBg} p-4 shadow-brutal-sm ${className}`}
      data-testid="memo-warning-banner"
      data-severity={result.severity}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
          {isCritical ? (
            <AlertCircle className={`h-4 w-4 ${iconBg}`} aria-hidden="true" />
          ) : (
            <AlertTriangle className={`h-4 w-4 ${iconBg}`} aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-display text-xs font-bold uppercase tracking-wider text-ink">
                {result.title}
              </h4>
              <p className="mt-0.5 text-xs text-ink/85 font-medium leading-relaxed">
                {result.message}
              </p>
            </div>

            {result.byteLength > 0 && (
              <span
                className={`shrink-0 rounded-md border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                  result.byteLength > STELLAR_MEMO_MAX_BYTES
                    ? "bg-flamingo text-white"
                    : "bg-cream text-ink"
                }`}
                title={`Stellar limit: ${STELLAR_MEMO_MAX_BYTES} bytes`}
              >
                {result.byteLength}/{STELLAR_MEMO_MAX_BYTES}B
              </span>
            )}
          </div>

          {result.actionHint && (
            <p className="text-[11px] text-ink/75 leading-normal">
              {result.actionHint}
            </p>
          )}

          {result.suggestedMemo && onFixMemo && (
            <div className="pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onFixMemo(result.suggestedMemo!)}
                className="bg-cream hover:bg-white text-ink font-mono text-xs border-2 border-ink shadow-brutal-xs flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-grape" />
                Use Suggested Memo:{" "}
                <span className="font-bold underline">
                  {result.suggestedMemo}
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
