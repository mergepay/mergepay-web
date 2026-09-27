"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface SessionTimeoutDialogProps {
  open: boolean;
  onContinue: () => void;
  onLogout: () => void;
}

export function SessionTimeoutDialog({
  open,
  onContinue,
  onLogout,
}: SessionTimeoutDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={() => {}}
      title="Session Expiring"
      description="Your session will expire soon due to inactivity."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-flamingo mt-0.5 flex-shrink-0" />
          <p className="text-sm text-ink">
            You've been inactive for a while. Your session will expire in 1 minute.
            Would you like to continue your session or log out now?
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
