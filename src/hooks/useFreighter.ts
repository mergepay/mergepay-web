"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  assertWalletNetwork,
  connectWallet,
  NetworkMismatchError,
  WalletError,
  type WalletErrorCode,
} from "@/lib/stellar";
import { EXPECTED_NETWORK_LABEL } from "@/lib/constants";

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
  "network_mismatch",
];

export interface UseFreighterResult {
  isConnecting: boolean;
  isRetrying: boolean;
  retryCount: number;
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
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<WalletErrorCode | null>(null);

  const resetError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const connectWithRetry = useCallback(
    async (options: UseFreighterOptions = {}): Promise<string> => {
      const {
        maxRetries = 3,
        retryDelayMs = 1000,
        showToasts = true,
        validateNetwork = true,
      } = options;
      setIsConnecting(true);
      setError(null);
      setErrorCode(null);

      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          if (attempt > 0) {
            setIsRetrying(true);
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

          // User cancellation, a missing extension, or a network mismatch
          // can't be fixed by trying again — the retry loop would only burn
          // time and hide the real problem behind a generic failure.
          const isNonRetryable = NON_RETRYABLE_CODES.includes(errCode);

          if (isNonRetryable || attempt > maxRetries) {
            setIsConnecting(false);
            setIsRetrying(false);
            setError(userMessage);
            setErrorCode(errCode);

            if (showToasts) {
              if (errCode === "network_mismatch" && err instanceof NetworkMismatchError) {
                toast.warning(networkMismatchToastMessage(err.walletNetwork), {
                  description: err.message,
                  duration: 10_000,
                });
              } else {
                toast.error(userMessage);
              }
            }
            throw err;
          }
        }
      }

      setIsConnecting(false);
      setIsRetrying(false);
      const fallbackErr = new WalletError("Failed to connect after retries.", "network");
      if (showToasts) toast.error(fallbackErr.message);
      throw fallbackErr;
    },
    []
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
      setError(null);
      setErrorCode(null);

      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          if (attempt > 0) {
            setIsRetrying(true);
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
            setError(message);
            setErrorCode(errCode);

            if (showToasts) {
              if (errCode === "network_mismatch" && err instanceof NetworkMismatchError) {
                toast.warning(networkMismatchToastMessage(err.walletNetwork), {
                  description: err.message,
                  duration: 10_000,
                });
              } else {
                toast.error(message);
              }
            }
            throw err;
          }
        }
      }

      setIsConnecting(false);
      setIsRetrying(false);
      throw new WalletError("Operation failed after retries.", "unknown");
    },
    []
  );

  return {
    isConnecting,
    isRetrying,
    retryCount,
    error,
    errorCode,
    connectWithRetry,
    executeWalletAction,
    resetError,
  };
}
