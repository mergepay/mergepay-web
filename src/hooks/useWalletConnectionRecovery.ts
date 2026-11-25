"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  autoReconnectWallet,
  isFreighterAvailable,
  withTimeout,
  WalletError,
  type WalletErrorCode,
} from "@/lib/stellar";
import { useAuth } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { showWalletErrorToast } from "@/lib/walletToasts";

/**
 * Recovery status for the wallet connection state machine.
 *
 * - `idle`       — nothing attempted yet.
 * - `checking`   — actively probing Freighter.
 * - `retrying`   — a transient failure is being retried with backoff.
 * - `connected`  — the wallet is connected and an address is available.
 * - `locked`     — Freighter is locked; the user must unlock it.
 * - `unavailable`— Freighter is not installed or unreachable.
 * - `error`      — the last attempt failed terminally.
 */
export type WalletRecoveryStatus =
  | "idle"
  | "checking"
  | "retrying"
  | "connected"
  | "locked"
  | "unavailable"
  | "error";

export interface UseWalletConnectionRecoveryResult {
  status: WalletRecoveryStatus;
  retryCount: number;
  /** The recovered public key, or `null` when not connected. */
  publicKey: string | null;
  /** Trigger a manual recovery attempt. */
  recover: () => void;
}

/**
 * Maximum number of retry attempts for transient failures during
 * auto-reconnect. Beyond this, the hook surfaces the error to the user.
 */
const MAX_RETRIES = 3;
/**
 * Base delay for exponential backoff (ms). Actual delays grow as
 * `baseDelay * Math.pow(1.5, attempt - 1)`.
 */
const BASE_RETRY_DELAY_MS = 800;

/**
 * Automatically checks existing Freighter approval status on app mount and
 * attempts to recover a dropped wallet session with exponential backoff.
 *
 * When `isConnected()` or `getUserInfo()` fails or times out, the hook
 * retries transient failures (network, timeout) up to `MAX_RETRIES` times,
 * backing off between attempts. Non-retryable failures (locked, not
 * installed, user rejected) surface immediately with a sonner toast that
 * tells the user exactly what to do.
 *
 * All UI notifications go through `sonner` so the user is always informed
 * of connection status changes, including fallback states for a locked or
 * unresponsive wallet extension.
 */
export function useWalletConnectionRecovery(): UseWalletConnectionRecoveryResult {
  const [status, setStatus] = useState<WalletRecoveryStatus>("idle");
  const [retryCount, setRetryCount] = useState(0);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const cancelledRef = useRef(false);

  const setActiveWalletPublicKey = useAuth((s) => s.setActiveWalletPublicKey);
  const setConnected = useWalletStore((s) => s.setConnected);

  const attemptRecovery = useCallback(async () => {
    if (cancelledRef.current) return;
    setStatus("checking");
    setRetryCount(0);

    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      if (cancelledRef.current) return;

      try {
        if (attempt > 0) {
          setStatus("retrying");
          setRetryCount(attempt);
          const delay = BASE_RETRY_DELAY_MS * Math.pow(1.5, attempt - 1);
          await new Promise((res) => setTimeout(res, delay));
          if (cancelledRef.current) return;
        }

        // Check if Freighter is installed and reachable.
        const available = await withTimeout(
          isFreighterAvailable(),
          5000,
          "Freighter availability check timed out."
        );
        if (!mountedRef.current || cancelledRef.current) return;

        if (!available) {
          setStatus("unavailable");
          setConnected(false);
          setActiveWalletPublicKey(null);
          toast.error("Freighter extension not found.", {
            description: "Install the Freighter extension and refresh the page.",
            duration: 10_000,
          });
          return;
        }

        // Try silent auto-reconnect from session storage.
        const result = await autoReconnectWallet();
        if (!mountedRef.current || cancelledRef.current) return;

        if (result.success) {
          setStatus("connected");
          setRetryCount(0);
          setPublicKey(result.publicKey);
          setConnected(true);
          setActiveWalletPublicKey(result.publicKey);
          // Only toast on a recovery (attempt > 0) so a normal page load
          // with a live session does not fire a notification.
          if (attempt > 0) {
            toast.success("Wallet reconnected.", {
              description: "Your Freighter wallet session has been restored.",
            });
          }
          return;
        }

        // Non-retryable reasons — surface immediately.
        if (result.reason === "locked") {
          setStatus("locked");
          setConnected(false);
          setActiveWalletPublicKey(null);
          toast.warning("Freighter wallet is locked.", {
            description: "Unlock it in the extension to continue.",
            duration: 10_000,
          });
          return;
        }

        if (result.reason === "not_previously_connected") {
          // No prior session — not an error, just nothing to restore.
          setStatus("idle");
          return;
        }

        if (result.reason === "wallet_unavailable") {
          setStatus("unavailable");
          setConnected(false);
          setActiveWalletPublicKey(null);
          toast.error("Freighter extension not found.", {
            description: "Install the Freighter extension and refresh the page.",
            duration: 10_000,
          });
          return;
        }

        if (result.reason === "no_account") {
          // Wallet is there but no account shared — not an error.
          setStatus("idle");
          return;
        }

        // Transient `error` reason — retry if attempts remain.
        if (attempt >= MAX_RETRIES) {
          setStatus("error");
          setConnected(false);
          showWalletErrorToast("network", result.message);
          return;
        }

        // Fall through to retry.
      } catch (err) {
        if (!mountedRef.current || cancelledRef.current) return;

        const code: WalletErrorCode =
          err instanceof WalletError
            ? err.code
            : "unknown";
        const message = err instanceof Error ? err.message : "Wallet recovery failed.";

        // Non-retryable codes surface immediately.
        const nonRetryable: WalletErrorCode[] = [
          "locked",
          "not_installed",
          "user_rejected",
          "network_mismatch",
        ];

        if (nonRetryable.includes(code) || attempt >= MAX_RETRIES) {
          setStatus("error");
          setConnected(false);
          setActiveWalletPublicKey(null);
          showWalletErrorToast(code, message);
          return;
        }

        // Fall through to retry.
      }

      attempt++;
    }

    // Exhausted all retries.
    if (!mountedRef.current || cancelledRef.current) return;
    setStatus("error");
    setConnected(false);
    toast.error("Could not reconnect to Freighter.", {
      description: "Check the extension and try again, or reconnect manually.",
      duration: 10_000,
    });
  }, [setActiveWalletPublicKey, setConnected]);

  const recover = useCallback(() => {
    cancelledRef.current = false;
    void attemptRecovery();
  }, [attemptRecovery]);

  useEffect(() => {
    mountedRef.current = true;
    cancelledRef.current = false;

    void attemptRecovery();

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    };
  }, [attemptRecovery]);

  return { status, retryCount, publicKey, recover };
}
