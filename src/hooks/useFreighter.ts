"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  connectWallet,
  WalletError,
  type WalletErrorCode,
  walletMessage,
} from "@/lib/stellar";

export interface UseFreighterOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  showToasts?: boolean;
}

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
      const { maxRetries = 3, retryDelayMs = 1000, showToasts = true } = options;
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

          // User cancellation or missing extension shouldn't retry in a loop
          const isNonRetryable =
            errCode === "user_rejected" || errCode === "not_installed";

          if (isNonRetryable || attempt > maxRetries) {
            setIsConnecting(false);
            setIsRetrying(false);
            setError(userMessage);
            setErrorCode(errCode);

            if (showToasts) {
              toast.error(userMessage);
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

          const isNonRetryable =
            errCode === "user_rejected" || errCode === "not_installed";

          if (isNonRetryable || attempt > maxRetries) {
            setIsConnecting(false);
            setIsRetrying(false);
            setError(message);
            setErrorCode(errCode);

            if (showToasts) {
              toast.error(message);
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
