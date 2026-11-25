import { toast } from "sonner";
import type { ClassifiedSettlementError } from "@/lib/stellar/transactions";

/**
 * Final-result toasts for a settlement.
 *
 * A settlement ends in one of a few ways and the user should hear about each
 * even if the dialog is no longer in view: Stellar accepted it, Stellar
 * rejected it, they declined the signature in Freighter, or it was not
 * confirmed in time. The copy for the failures already lives in
 * `classifySettlementError`, so this module only decides how loudly to say it.
 */

/** One id for every failure toast, so a retry replaces the last one instead of stacking. */
export const SETTLEMENT_FAILURE_TOAST_ID = "settlement-failure";

export interface SettlementFailureToast {
  level: "warning" | "error";
  message: string;
  description: string;
}

/**
 * How to tell the user about a failed settlement, or `null` when there is
 * nothing to add (a cancelled attempt: the user is already looking at it).
 *
 * Declining the signature and running out of time are warnings, not errors:
 * neither one says the payment was refused, and a timeout can still end in a
 * confirmed payment. Everything else is an error.
 *
 * @param submitted Whether the signed payment had already been handed to the
 *   API. Then a vague failure must not read as "nothing happened", because
 *   paying again could pay twice.
 */
export function settlementFailureToast(
  error: ClassifiedSettlementError,
  options: { submitted?: boolean } = {}
): SettlementFailureToast | null {
  if (error.kind === "aborted") return null;

  const mayStillSettle =
    options.submitted === true &&
    (error.kind === "timeout" || error.kind === "network" || error.kind === "unknown");

  return {
    level: error.kind === "rejected" || error.kind === "timeout" ? "warning" : "error",
    message: error.title,
    description: mayStillSettle
      ? `${error.message} Your payment may still go through, so check its status before paying again.`
      : error.message,
  };
}

/** Raise the toast for a failed settlement. */
export function notifySettlementFailure(
  error: ClassifiedSettlementError,
  options: { submitted?: boolean } = {}
): void {
  const view = settlementFailureToast(error, options);
  if (!view) return;
  toast[view.level](view.message, {
    description: view.description,
    id: SETTLEMENT_FAILURE_TOAST_ID,
    duration: view.level === "warning" ? 8_000 : 10_000,
  });
}

/**
 * The settlement is submitted but its status can no longer be read, either
 * because the connection dropped or because it stayed unconfirmed for too
 * long. The payment may have gone through, so say that and nothing more.
 */
export function notifySettlementStatusUnknown(reason: "stalled" | "timed_out"): void {
  toast.warning(reason === "stalled" ? "Couldn't check the payment status" : "Still waiting for confirmation", {
    description:
      reason === "stalled"
        ? "We lost the connection. Your payment may still be processing, so check its status before paying again."
        : "Stellar is taking longer than usual. Your payment may still confirm, so check its status before paying again.",
    id: SETTLEMENT_FAILURE_TOAST_ID,
    duration: 10_000,
  });
}
