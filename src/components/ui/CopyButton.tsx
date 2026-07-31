"use client";

import { useState, useEffect } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard control.
 *
 * Feedback is never colour-only: the icon swaps to a check, any visible
 * label changes to "Copied", and a visually hidden live region announces
 * the result to assistive technology.
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
  /** What is being copied, e.g. "transaction hash" — used in the a11y label. */
  what?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard access can be denied (insecure origin, permission
      // policy). Surface that through the app's existing notification
      // channel instead of showing a "copied" state that never happened.
      toast.error(`Could not copy the ${what}. Select and copy it manually.`);
    }
  }

  return (
    <button
      type="button"
      aria-label={copied ? `${what} copied` : `Copy ${what}`}
      onClick={copy}
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
