"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { breakdownMemo } from "@/lib/memoValidation";

/**
 * Visual breakdown of a settlement memo shown during the review step.
 *
 * Displays the memo structure (prefix + short code), byte-count gauge,
 * and any warnings when the memo deviates from expected reconciliation
 * codes or Stellar constraints.
 */
export function MemoPreview({
  memo,
  expectedCode,
  editable,
  editedMemo,
  onEdit,
}: {
  /** The memo string attached to the settlement. */
  memo: string | null | undefined;
  /** The expected short code from the API (for deviation detection). */
  expectedCode?: string | null;
  /** Whether the user can edit the memo (only during review). */
  editable?: boolean;
  /** The current edited value (controlled input). */
  editedMemo?: string;
  /** Callback when the user edits the memo. */
  onEdit?: (value: string) => void;
}) {
  const breakdown = breakdownMemo(editedMemo ?? memo ?? "", expectedCode);

  if (!breakdown.memo) return null;

  const usagePercent = Math.round(
    (breakdown.byteLength / breakdown.maxLength) * 100
  );

  const gaugeColor =
    usagePercent > 90
      ? "bg-flamingo"
      : usagePercent > 70
        ? "bg-tangerine"
        : "bg-lime";

  const gaugeWidth = Math.min(100, usagePercent);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
          Memo
        </span>
        <span className="text-[10px] text-ink/40">
          {breakdown.byteLength}/{breakdown.maxLength} bytes
        </span>
      </div>

      {/* Memo display */}
      {editable && onEdit ? (
        <div className="rounded-xl border-2 border-ink bg-cream px-3 py-2">
          <input
            type="text"
            value={editedMemo ?? breakdown.memo}
            onChange={(e) => onEdit(e.target.value)}
            className="w-full bg-transparent font-mono text-sm text-ink outline-none"
            maxLength={breakdown.maxLength}
            spellCheck={false}
            aria-label="Settlement memo"
          />
        </div>
      ) : (
        <div className="rounded-xl border-2 border-ink bg-cream px-3 py-2">
          <code className="font-mono text-sm text-ink">{breakdown.memo}</code>
        </div>
      )}

      {/* Breakdown annotation */}
      <div className="flex items-center gap-2 text-xs text-ink/50">
        {breakdown.conformsToConvention ? (
          <CheckCircle2 className="h-3 w-3 text-lime-dark" />
        ) : (
          <Info className="h-3 w-3" />
        )}
        <span>
          {breakdown.conformsToConvention ? (
            <>
              Prefix{" "}
              <span className="font-mono text-grape">{breakdown.prefix}</span>
              <span className="text-ink/30 mx-1">|</span>
              Code{" "}
              <span className="font-mono text-ink/70">
                {breakdown.shortCode}
              </span>
            </>
          ) : (
            <span className="text-ink/70">{breakdown.memo}</span>
          )}
        </span>
      </div>

      {/* Byte usage gauge */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${gaugeColor}`}
          style={{ width: `${gaugeWidth}%` }}
          role="progressbar"
          aria-valuenow={breakdown.byteLength}
          aria-valuemin={0}
          aria-valuemax={breakdown.maxLength}
          aria-label="Memo byte usage"
        />
      </div>
      <div className="flex justify-between text-[10px] text-ink/40">
        <span>0 bytes</span>
        <span>
          {breakdown.remainingBytes} bytes remaining
        </span>
        <span>{breakdown.maxLength} bytes max</span>
      </div>

      {/* Warnings */}
      {breakdown.warnings.map((warning, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-lg border-2 border-ink bg-tangerine-pale px-3 py-2 text-xs text-ink/70"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tangerine-dark" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}
