"use client";

import { Check, Copy } from "lucide-react";

import { useClipboard } from "@/hooks/use-clipboard";
import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard control.
 *
 * Feedback is never colour-only: the icon swaps to a check, any visible
 * label changes to "Copied", and a visually hidden live region announces
 * the result to assistive technology. The actual write goes through
 * `useClipboard` -> `copyTextToClipboard`, so browsers without the async
 * Clipboard API (insecure origins, denied permissions) still fall back to a
 * `execCommand` copy instead of failing outright.
 */
export default function CopyButton({
  text,
  className,
  label,
  what = "value",
}: {
  text: string;
  className?: string;
  label?: string;
  /** What is being copied, e.g. "transaction hash" — used in the a11y label and toast. */
  what?: string;
}) {
  const { copied, copy } = useClipboard({ what });

  return (
    <button
      type="button"
      aria-label={copied ? `${what} copied` : `Copy ${what}`}
      onClick={() => void copy(text)}
      className={cn(
        "inline-flex items-center gap-1 border-2 border-ink rounded-lg px-2 py-1 text-xs font-bold shadow-brutal-sm transition-colors",
        copied ? "bg-lime" : "bg-cream hover:bg-butter",
        className
      )}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {label && <span>{copied ? "Copied" : label}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `${what} copied to clipboard` : ""}
      </span>
    </button>
  );
}
