"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { copyTextToClipboard } from "@/lib/clipboard";

/** How long the success state stays on the button, in milliseconds. */
export const COPIED_FEEDBACK_MS = 2000;

export interface UseClipboardOptions {
  /**
   * What is being copied, e.g. `"public key"`. Used to build the toast
   * message and the screen-reader label, so callers get consistent wording.
   */
  what?: string;
  /** Silence the sonner toasts (the button's own state still updates). */
  showToast?: boolean;
  /** Override the success toast title. */
  successMessage?: string;
  /** Override the failure toast message. */
  errorMessage?: string;
}

export interface UseClipboardResult {
  /** Whether the clipboard write succeeded for the most recent attempt. */
  copied: boolean;
  isCopying: boolean;
  /** Perform the copy. Resolves to whether the clipboard actually received it. */
  copy: (text: string) => Promise<boolean>;
}

/** `public key` -> `Public key`, for sentence-cased toast copy. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Copy-to-clipboard with a timed success state and sonner feedback.
 *
 * Delegates to `copyTextToClipboard`, which falls back to a hidden-textarea
 * `execCommand("copy")` when the async Clipboard API is unavailable or
 * denied — insecure origins and locked-down permissions policies both hit
 * that path, and neither should leave the user staring at a button that
 * silently did nothing.
 *
 * The success state clears on its own after {@link COPIED_FEEDBACK_MS} and
 * the timer is cancelled on unmount, so a copy-then-navigate never leaves a
 * pending `setState` behind.
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardResult {
  const {
    what = "value",
    showToast = true,
    successMessage,
    errorMessage,
  } = options;

  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      setIsCopying(true);
      try {
        const ok = await copyTextToClipboard(text);
        clearTimer();

        if (ok) {
          setCopied(true);
          timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
          if (showToast) {
            toast.success(successMessage ?? `${capitalize(what)} copied`);
          }
        } else {
          setCopied(false);
          if (showToast) {
            toast.error(
              errorMessage ??
                `Could not copy the ${what}. Select and copy it manually.`
            );
          }
        }
        return ok;
      } finally {
        setIsCopying(false);
      }
    },
    [what, showToast, successMessage, errorMessage, clearTimer]
  );

  return { copied, isCopying, copy };
}
