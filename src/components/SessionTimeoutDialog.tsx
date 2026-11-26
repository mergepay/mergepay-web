"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface SessionTimeoutDialogProps {
  open: boolean;
  /** Seconds left before the idle session is locked. */
  secondsRemaining?: number;
  onContinue: () => void;
  onLogout: () => void;
}

export function SessionTimeoutDialog({
  open,
  secondsRemaining,
  onContinue,
  onLogout,
}: SessionTimeoutDialogProps) {
  const remaining =
    typeof secondsRemaining === "number"
      ? Math.max(0, Math.ceil(secondsRemaining))
      : null;

  return (
    <Dialog
      open={open}
      onClose={() => {}}
      title="Session Expiring"
      description="Your session will expire soon due to inactivity."
      dismissible={false}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-flamingo"
            aria-hidden="true"
          />
          <p className="text-sm text-ink">
            You&apos;ve been inactive for a while. Your session will lock in{" "}
            <span className="font-bold" aria-live="polite">
              {remaining === null
                ? "less than a minute"
                : `${remaining} second${remaining === 1 ? "" : "s"}`}
            </span>
            . Would you like to continue your session or sign out now?
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onLogout}>
            Log Out
          </Button>
          <Button onClick={onContinue}>Continue Session</Button>
        </div>
      </div>
    </Dialog>
  );
}
