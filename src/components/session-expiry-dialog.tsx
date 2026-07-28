"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wallet, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function SessionExpiryDialog() {
  const { login, isLoading } = useAuth();

  return (
    <Dialog 
      open={true} 
      onClose={() => {}}
      title="Session Expired"
      description="Your session has expired. Please sign in again to continue."
      dismissible={false}
    >
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-flamingo/10">
          <ShieldAlert className="h-8 w-8 text-flamingo" />
        </div>
        <p className="text-sm text-ink/70">
          For your security, your session has expired. Please re-authenticate
          with your wallet to continue where you left off.
        </p>
        <Button
          size="lg"
          className="w-full"
          loading={isLoading}
          onClick={() => {
            // Re-authenticating resets the session expiry flag in useAuth
            login();
          }}
        >
          <Wallet className="mr-2 h-5 w-5" /> Re-connect Wallet
        </Button>
      </div>
    </Dialog>
  );
}
