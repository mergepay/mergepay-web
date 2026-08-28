"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, ApiRequestError } from "./api";
import { useConfirmSettlement, useSettlementStatus } from "./queries";
import {
  NotInstalledMessage,
  signXdr,
  WalletError,
  WalletErrorCode,
  UserRejectedError,
} from "./stellar";
import { validateSettlementInput } from "./paymentValidation";
import type {
  Settlement,
  SettlementSuggestion,
  User,
} from "./types";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type SettlementStep =
  | "idle"
  | "review"
  | "preparing"
  | "awaiting_wallet"
  | "submitted"
  | "confirmed"
  | "cancelled"
  | "failed";

export interface SettleTarget {
  expenseId?: string;
  to: User;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  label: string;
}

export function suggestionToTarget(s: SettlementSuggestion): SettleTarget {
  return {
    to: s.to,
    amount: s.amount,
    assetCode: s.assetCode,
    assetIssuer: s.assetIssuer,
    label: `Settle up with ${s.to.displayName}`,
  };
}

export type SettlementErrorPayload = {
  message: ReactNode;
  walletErrorCode: WalletErrorCode | null;
};

// ---------------------------------------------------------------------------
// Pure guard — exported for testing
// ---------------------------------------------------------------------------

export function shouldBlockSettlementSubmit(args: {
  isMutationPending: boolean;
  submittingRef: boolean;
}): boolean {
  return args.isMutationPending || args.submittingRef;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSettlementFlow(groupId: string) {
  const [step, setStep] = useState<SettlementStep>("idle");
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorPayload, setErrorPayload] = useState<SettlementErrorPayload>({
    message: "",
    walletErrorCode: null,
  });

  // Refs
  const submittingRef = useRef(false);
  const cancelledRef = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;

  // React Query mutation for confirming a signed settlement
  const confirm = useConfirmSettlement(groupId);

  // Polling — only enabled once the user has submitted (settlementId is set)
  const statusQuery = useSettlementStatus(
    settlementId,
    step === "submitted"
  );

  // Watch the polling status for terminal-state transitions.
  // This runs inside the hook so consumers don't need to manage it.
  useEffect(() => {
    if (stepRef.current !== "submitted") return;
    const data = statusQuery.data as Settlement | undefined;
    if (!data) return;

    const liveHash = data.stellarTxHash ?? null;
    if (data.status === "confirmed") {
      setTxHash(liveHash);
      setStep("confirmed");
      toast.success("Settled on Stellar");
    } else if (data.status === "failed") {
      setStep("failed");
      setErrorPayload({
        message: "Stellar rejected this transaction. Please try again.",
        walletErrorCode: null,
      });
    }
  }, [statusQuery.data, statusQuery.status]);

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  const resetAll = useCallback(() => {
    setStep("review");
    setSettlementId(null);
    setTxHash(null);
    setErrorPayload({ message: "", walletErrorCode: null });
    submittingRef.current = false;
    cancelledRef.current = false;
  }, []);

  const open = useCallback(() => {
    setStep("review");
    setSettlementId(null);
    setTxHash(null);
    setErrorPayload({ message: "", walletErrorCode: null });
    submittingRef.current = false;
    cancelledRef.current = false;
  }, []);

  /**
   * Core submission flow. A local ref (`submittingRef`) prevents
   * concurrent calls — only one submission ever runs at a time.
   */
  const submit = useCallback(
    async (target: SettleTarget): Promise<void> => {
      if (!target) return;

      if (
        shouldBlockSettlementSubmit({
          isMutationPending: confirm.isPending,
          submittingRef: submittingRef.current,
        })
      ) {
        return;
      }

      submittingRef.current = true;
      cancelledRef.current = false;
      setErrorPayload({ message: "", walletErrorCode: null });

      // 1. Validate input
      const validation = validateSettlementInput({
        amount: target.amount,
        assetCode: target.assetCode,
        assetIssuer: target.assetIssuer,
      });
      if (!validation.valid) {
        setErrorPayload({
          message: validation.error ?? "Invalid payment input",
          walletErrorCode: null,
        });
        submittingRef.current = false;
        return;
      }

      try {
        // 2. Build settlement intent (API call)
        setStep("preparing");
        const intent = target.expenseId
          ? await api.settleExpense(target.expenseId, {
              assetCode: target.assetCode,
              assetIssuer: target.assetIssuer,
            })
          : await api.createSettlement(groupId, {
              toUserId: target.to.id,
              amount: target.amount,
              assetCode: target.assetCode,
              assetIssuer: target.assetIssuer,
            });

        // 3. Sign in Freighter
        setStep("awaiting_wallet");
        const signedXdr = await signXdr(
          intent.xdr,
          intent.networkPassphrase
        );

        if (cancelledRef.current) {
          setStep("cancelled");
          setErrorPayload({
            message: "The request was cancelled. No transaction was submitted.",
            walletErrorCode: "user_rejected",
          });
          submittingRef.current = false;
          return;
        }

        // 4. Confirm with the API (submits to Stellar)
        const { settlement } = await confirm.mutateAsync({
          settlementId: intent.settlement.id,
          data: { signedXdr },
        });

        setSettlementId(intent.settlement.id);
        setTxHash(settlement.stellarTxHash ?? null);
        setStep("submitted");

        // Handle synchronous terminal states
        if (settlement.status === "confirmed") {
          setStep("confirmed");
          toast.success("Settled on Stellar");
        } else if (settlement.status === "failed") {
          setStep("failed");
          setErrorPayload({
            message: "Stellar rejected this transaction. Please try again.",
            walletErrorCode: null,
          });
        }
      } catch (e) {
        if (e instanceof UserRejectedError) {
          setStep("cancelled");
          setErrorPayload({
            message: e.message,
            walletErrorCode: "user_rejected",
          });
        } else if (e instanceof WalletError) {
          setStep("cancelled");
          if (e.code === "not_installed") {
            setErrorPayload({
              message: <NotInstalledMessage />,
              walletErrorCode: "not_installed",
            });
          } else {
            setErrorPayload({
              message: e.message,
              walletErrorCode: e.code,
            });
          }
        } else if (e instanceof ApiRequestError) {
          setStep("failed");
          setErrorPayload({
            message: e.message,
            walletErrorCode: null,
          });
        } else {
          setStep("failed");
          setErrorPayload({
            message: "Settlement failed. Please try again.",
            walletErrorCode: null,
          });
        }
      } finally {
        submittingRef.current = false;
      }
    },
    [groupId, confirm]
  );

  /** Retry from a "failed" state only. */
  const retry = useCallback(
    (target: SettleTarget): void => {
      if (stepRef.current !== "failed") return;
      setErrorPayload({ message: "", walletErrorCode: null });
      submit(target);
    },
    [submit]
  );

  return {
    // State
    step,
    settlementId,
    txHash,
    error: errorPayload.message,
    walletErrorCode: errorPayload.walletErrorCode,
    isSubmitting: submittingRef.current || confirm.isPending,

    // Actions
    submit,
    retry,
    open,
    resetAll,
  };
}
