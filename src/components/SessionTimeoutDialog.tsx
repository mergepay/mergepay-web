"client";

import React from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { Button } from "@/components/ui/button";

export interface SessionTimeoutDialogProps {
  open: boolean;
  remainingSeconds?: number;
  onContinue?: () => void;
  onLogout?: () => void;
}

export function SessionTimeoutDialog({
  open,
  remainingSeconds = 120,
  onContinue,
  onLogout,
}: SessionTimeoutDialogProps) {
  const minutes = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const timeDisplay = `${minutes}:${secs < 10 ? "0" : ""}${secs}`;

  return (
    <AccessibleDialog
      isOpen={open}
      onClose={onContinue || (() => {})}
      title="Session Inactivity Warning"
      dismissible={false}
    >
      <div className="flex flex-col gap-4 py-2">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-tangerine-pale border-2 border-ink text-ink">
          <AlertTriangle className="h-6 w-6 shrink-0 text-tangerine-dark" />
          <p className="text-sm font-medium">
            Your session is about to expire due to inactivity to protect your wallet. You will be logged out in{" "}
            <span className="font-mono font-bold text-base">
              {timeDisplay}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-end pt-2">
          <Button
            variant="outline"
            onClick={onLogout}
            className="w-full sm:w-auto"
          >
            Log out now
          </Button>
          <Button
            variant="primary"
            onClick={onContinue}
            className="w-full sm:w-auto"
          >
            Stay signed in
          </Button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
