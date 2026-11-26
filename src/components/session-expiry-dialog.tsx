"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { handleApiError } from "@/lib/errorHandler";

export interface SessionExpiryDialogProps {
  /**
   * Called after the wallet has been reconnected successfully. The idle-lock
   * screen uses this to reveal the app again without navigating away.
   */
  onReauthenticated?: () => void;
  /** Distinguish a token expiry from an inactivity lock in the copy. */
  reason?: "expired" | "idle";
}

export function SessionExpiryDialog({
  onReauthenticated,
  reason = "expired",
}: SessionExpiryDialogProps) {
  const { login, isLoading } = useAuth();
  const idle = reason === "idle";

  return (
    <Dialog
      open={true}
      onClose={() => {}}
      title={idle ? "Session Locked" : "Session Expired"}
      description={
        idle
          ? "You were inactive, so we locked this session and cleared your cached account data."
          : "Your session has expired. Please sign in again to continue."
      }
      dismissible={false}
    >
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-flamingo/10">
          <ShieldAlert className="h-8 w-8 text-flamingo" />
        </div>
        <p className="text-sm text-ink/70">
          {idle
            ? "Nothing was lost. Re-authenticate with Freighter to unlock the app and pick up where you left off."
            : "For your security, your session has expired. Please re-authenticate with your wallet to continue where you left off."}
        </p>
        <Button
          size="lg"
          className="w-full"
          loading={isLoading}
          onClick={async () => {
            try {
              // Re-authenticating resets the session expiry flag in useAuth.
              await login();
              onReauthenticated?.();
            } catch (error) {
              handleApiError(error, "Could not reconnect your wallet.");
            }
          }}
        >
          <Wallet className="mr-2 h-5 w-5" aria-hidden="true" /> Re-connect Wallet
        </Button>
      </div>
    </Dialog>
  );
}
