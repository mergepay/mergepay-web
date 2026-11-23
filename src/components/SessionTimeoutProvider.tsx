"client";

import React, { useCallback } from "react";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { SessionTimeoutDialog } from "@/components/SessionTimeoutDialog";
import { useWalletStore } from "@/lib/wallet-store";
import { toast } from "sonner";

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const setConnected = useWalletStore((state) => state.setConnected);
  const isConnected = useWalletStore((state) => state.isConnected);

  const handleTimeout = useCallback(() => {
    try {
      setConnected(false);
      localStorage.removeItem("mergepay_auth_token");
      sessionStorage.clear();
      toast.error("Session terminated due to inactivity for security.");
    } catch (e) {
      console.error("Failed to clear session state on timeout:", e);
    }
  }, [setConnected]);

  const { showWarning, remainingSeconds, extendSession } = useInactivityTimeout({
    enabled: Boolean(isConnected),
    timeoutMs: 15 * 60 * 1000,
    warningMs: 2 * 60 * 1000,
    onTimeout: handleTimeout,
  });

  return (
    <>
      {children}
      <SessionTimeoutDialog
        open={showWarning}
        remainingSeconds={remainingSeconds}
        onContinue={extendSession}
        onLogout={handleTimeout}
      />
    </>
  );
}
