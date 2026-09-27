"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { EXPECTED_NETWORK_LABEL } from "@/lib/constants";
import {
  assertWalletNetwork,
  connectWallet,
  NetworkMismatchError,
  WalletError,
  type WalletErrorCode,
} from "@/lib/stellar";
import { showWalletErrorToast } from "@/lib/walletToasts";


export interface UseFreighterOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  showToasts?: boolean;
  /**
   * Compare the wallet's network against this deployment after access is
   * granted. Defaults to `true`; pass `false` for a bare connection probe.
   */
  validateNetwork?: boolean;
}

/**
 * Copy shown when the wallet is on the wrong network. A mismatch is fixed in
 * the Freighter extension, not here, so the message says exactly where to go.
 */
function networkMismatchToastMessage(walletNetwork: string): string {
  return `Switch Freighter to ${EXPECTED_NETWORK_LABEL} (currently ${walletNetwork}), then reconnect. Open the extension → Settings → Network.`;
}

/**
 * Codes that will never succeed on a retry: the user has to act first —
 * grant access, unlock the wallet, or switch networks in the extension.
 */
const NON_RETRYABLE_CODES: readonly WalletErrorCode[] = [
  "user_rejected",
  "not_installed",
  // A locked wallet stays locked until the user types their password in the
  // extension; waiting out three retries only delays the message that says so.
  "locked",
  "network_mismatch",
];

/**
 * State machine for the wallet interaction: one value rather than several
 * booleans, so the UI can never render an impossible combination (retrying
 * *and* idle, for example) and a connect button can disable itself for
 * every state except `idle`.
 *
 * - `idle`       — nothing attempted yet, or `resetError()` cleared the last
 *                  failure.
 * - `connecting` — a request is pending in Freighter.
 * - `retrying`   — a transient failure is being retried.
 * - `connected`  — the last interaction succeeded.
 * - `error`      — the last interaction failed; `errorCode` says why.
 */
export type FreighterStatus =
  | "idle"
  | "connecting"
  | "retrying"
  | "connected"
  | "error";

export interface UseFreighterResult {
  isConnecting: boolean;
  isRetrying: boolean;
  retryCount: number;
  /** Connection state machine — drives disabled/loading connect controls. */
  status: FreighterStatus;
  error: string | null;
  errorCode: WalletErrorCode | null;
  connectWithRetry: (options?: UseFreighterOptions) => Promise<string>;
  executeWalletAction: <T>(
    actionFn: () => Promise<T>,
    options?: UseFreighterOptions & { errorMessage?: string; successMessage?: string }
  ) => Promise<T>;
  resetError: () => void;
}

export function useFreighter(): UseFreighterResult {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState<FreighterStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<WalletErrorCode | null>(null);
  // The in-flight connection promise, shared by every caller so a second
  // click joins the pending request instead of opening another Freighter
  // popup behind the first one.
  const connectionRef = useRef<Promise<string> | null>(null);

  const resetError = useCallback(() => {
    setError(null);
    setErrorCode(null);
    setStatus("idle");
  }, []);

  const runConnect = useCallback(
    async (options: UseFreighterOptions): Promise<string> => {
      const {
        maxRetries = 3,
        retryDelayMs = 1000,
        showToasts = true,
        validateNetwork = true,
      } = options;
      setIsConnecting(true);
      setStatus("connecting");
      setError(null);
      setErrorCode(null);

      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          if (attempt > 0) {
            setIsRetrying(true);
            setStatus("retrying");
            setRetryCount(attempt);
            await new Promise((res) => setTimeout(res, retryDelayMs * Math.pow(1.5, attempt - 1)));
          }

          const publicKey = await connectWallet();
          // Only readable once access is granted, so it is checked here rather
          // than inside `connectWallet` (which also runs pre-auth flows).
          if (validateNetwork) {
            await assertWalletNetwork();
          }
          setIsConnecting(false);
          setIsRetrying(false);
          setRetryCount(0);
          setStatus("connected");
          return publicKey;
        } catch (err) {
          attempt++;

          let errCode: WalletErrorCode = "unknown";
          let userMessage = "Could not connect to Freighter wallet.";

          if (err instanceof WalletError) {
            errCode = err.code;
            userMessage = err.message;
          } else if (err instanceof Error) {
            userMessage = err.message;
          }

          // User cancellation, a locked wallet, a missing extension, or a
          // network mismatch can't be fixed by trying again — the retry loop
          // would only burn time and hide the real problem behind a generic
          // failure.
          const isNonRetryable = NON_RETRYABLE_CODES.includes(errCode);

          if (isNonRetryable || attempt > maxRetries) {
            setIsConnecting(false);
            setIsRetrying(false);
            setStatus("error");
            setError(userMessage);
            setErrorCode(errCode);

            if (showToasts) {
              if (errCode === "network_mismatch" && err instanceof NetworkMismatchError) {
                toast.warning(networkMismatchToastMessage(err.walletNetwork), {
                  description: err.message,
                  duration: 10_000,
                });
              } else {
                // Adds the remediation line ("Please unlock Freighter and try
                // again.") for locked and missing-extension failures.
                showWalletErrorToast(errCode, userMessage);
              }
            }
            throw err;
          }
        }
      }

      setIsConnecting(false);
      setIsRetrying(false);
      setStatus("error");
      const fallbackErr = new WalletError("Failed to connect after retries.", "network");
      if (showToasts) toast.error(fallbackErr.message);
      throw fallbackErr;
    },
    []
  );

  const connectWithRetry = useCallback(
    (options: UseFreighterOptions = {}): Promise<string> => {
      // A second click while the first request is pending joins it rather
      
      // than opening another Freighter popup (and another) behind it.
      if (connectionRef.current) return connectionRef.current;

      const pending = runConnect(options);
      connectionRef.current = pending;
      const settle = () => {
        if (connectionRef.current === pending) connectionRef.current = null;
      };
      // Handlers rather than `finally` so the derived promise never
      // rejects unhandled; the caller still gets the original rejection.
      void pending.then(settle, settle);
      return pending;
    },
    [runConnect]
  );

  const executeWalletAction = useCallback(
    async <T>(
      actionFn: () => Promise<T>,
      options: UseFreighterOptions & { errorMessage?: string; successMessage?: string } = {}
    ): Promise<T> => {
      const {
        maxRetries = 2,
        retryDelayMs = 1000,
        showToasts = true,
        errorMessage,
        successMessage,
        validateNetwork,
      } = options;

      setIsConnecting(true);
      setStatus("connecting");
      setError(null);
      setErrorCode(null);

      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          if (attempt > 0) {
            setIsRetrying(true);
            setStatus("retrying");
            setRetryCount(attempt);
            await new Promise((res) => setTimeout(res, retryDelayMs));
          }

          // Actions are wallet calls too, so they get the same network guard
          // unless the caller has already validated it.
          if (validateNetwork) {
            await assertWalletNetwork();
          }

          const result = await actionFn();
          setIsConnecting(false);
          setIsRetrying(false);
          setRetryCount(0);
          setStatus("connected");

          if (showToasts && successMessage) {
            toast.success(successMessage);
          }
          return result;
        } catch (err) {
          attempt++;

          let errCode: WalletErrorCode = "unknown";
          let message = errorMessage || "Wallet operation failed.";

          if (err instanceof WalletError) {
            errCode = err.code;
            message = err.message;
          } else if (err instanceof Error) {
            message = err.message;
          }

          const isNonRetryable = NON_RETRYABLE_CODES.includes(errCode);

          if (isNonRetryable || attempt > maxRetries) {
            setIsConnecting(false);
            setIsRetrying(false);
            setStatus("error");
            setError(message);
            setErrorCode(errCode);

            if (showToasts) {
              if (errCode === "network_mismatch" && err instanceof NetworkMismatchError) {
                toast.warning(networkMismatchToastMessage(err.walletNetwork), {
                  description: err.message,
                  duration: 10_000,
                });
              } else {
                showWalletErrorToast(errCode, message);
              }
            }
            throw err;
          }
        }
      }

      setIsConnecting(false);
      setIsRetrying(false);
      setStatus("error");
      throw new WalletError("Operation failed after retries.", "unknown");
    },
    []
  );

  return {
    isConnecting,
    isRetrying,
    retryCount,
    status,
    error,
    errorCode,
    connectWithRetry,
    executeWalletAction,
    resetError,
  };
}
