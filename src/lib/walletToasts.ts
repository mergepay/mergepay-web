import { toast } from "sonner";
import { FREIGHTER_INSTALL_URL, type WalletErrorCode } from "@/lib/stellar";

/**
 * Extra fields for a wallet error toast: the remediation line plus the
 * controls that perform it.
 */
export interface WalletToastOptions {
  description: string;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Copy that tells the user exactly what to do before the next attempt.
 *
 * Some failures are end states rather than transient errors: retrying a
 * locked wallet, or a browser without the extension, produces the same
 * failure every time. The message names the step that changes the outcome —
 * `null` means the error message already tells the user what happened and
 * needs no extra line (a cancelled request, for example).
 */
export function walletRemediationDescription(
  code: WalletErrorCode
): string | null {
  switch (code) {
    case "locked":
      return "Please unlock Freighter and try again.";
    case "not_installed":
      return "Freighter isn't installed in this browser. Install it, then reconnect.";
    default:
      return null;
  }
}

/** The toast options for `code`, or `null` when nothing needs adding. */
export function walletRemediationToast(
  code: WalletErrorCode
): WalletToastOptions | null {
  const description = walletRemediationDescription(code);
  if (!description) return null;

  const options: WalletToastOptions = { description, duration: 10_000 };
  if (code === "not_installed") {
    options.action = {
      label: "Get Freighter",
      onClick: () => {
        window.open(FREIGHTER_INSTALL_URL, "_blank", "noopener,noreferrer");
      },
    };
  }
  return options;
}

/**
 * Reports a wallet failure with its remediation line attached, so a locked
 * or missing Freighter never looks like an unexplained dead end.
 */
export function showWalletErrorToast(code: WalletErrorCode, message: string): void {
  const options = walletRemediationToast(code);
  if (options) {
    toast.error(message, options);
    return;
  }
  // User rejection is a distinct, non-blocking warning rather than an error
  if (code === "user_rejected") {
    toast.warning(message, { duration: 5000 });
    return;
  }
  toast.error(message);
}
