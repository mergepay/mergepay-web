"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface SessionTimeoutDialogProps {
  open: boolean;
  onContinue: () => void;
  onLogout: () => void;
  /**
   * Seconds the session has left when the warning appears. Defaults to the
   * one-minute lead used by `useIdleSession`; exposed so the copy can follow
   * the timer instead of hard-coding "1 minute".
   */
  secondsRemaining?: number;
}

/**
 * Persistent idle-session warning (#898).
 *
 * The dialog is deliberately non-dismissible: Escape and backdrop clicks do
 * nothing, so the only two ways out are an explicit "Stay signed in" or an
 * explicit sign-out. That is the "persistent" half of the issue — a warning
 * that can be dismissed by reflex is not a warning.
 */
export function SessionTimeoutDialog({
  open,
  onContinue,
  onLogout,
  secondsRemaining = 60,
}: SessionTimeoutDialogProps) {
  const initialSeconds = Math.max(1, Math.ceil(secondsRemaining));
  const [remaining, setRemaining] = useState(initialSeconds);

  // The warning stays on screen for its whole lead time, so the copy counts
  // down with the hook's own timer instead of claiming "60 seconds" forever.
  useEffect(() => {
    setRemaining(initialSeconds);
    if (!open) return;
    const id = window.setInterval(() => {
      setRemaining((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, initialSeconds]);

  return (
    <Dialog
      open={open}
      onClose={() => {}}
      title="Session Expiring"
      description="Your session will expire soon due to inactivity."
      dismissible={false}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3" role="alert" aria-live="assertive">
          <AlertTriangle className="h-5 w-5 text-flamingo mt-0.5 flex-shrink-0" />
          <p className="text-sm text-ink">
            You&apos;ve been inactive for a while. Your session will expire in{" "}
            <span className="font-bold">
              {remaining} second{remaining === 1 ? "" : "s"}
            </span>
            . Continue your session or log out now?
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
