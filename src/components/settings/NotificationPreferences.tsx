"use client";

import { Bell, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "../../hooks/useNotifications";

export function NotificationPreferences() {
  const { preferences, permission, updatePreferences, requestPermission } = useNotifications();

  async function handleTogglePush(checked: boolean) {
    if (checked) {
      const res = await requestPermission();
      if (res !== "granted") {
        toast.error("Notification permission was denied. Please enable notifications in your browser settings.");
        return;
      }
      toast.success("Push notifications enabled");
    } else {
      updatePreferences({ pushEnabled: false });
      toast.success("Push notifications disabled");
    }
  }

  return (
    <Card className="space-y-4">
      <div className="border-b-3 border-ink bg-butter px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="font-display text-sm uppercase tracking-widest">Notification Preferences</h2>
        </div>
        <Badge tone={permission === "granted" ? "lime" : permission === "denied" ? "tangerine" : "paper"}>
          {permission}
        </Badge>
      </div>
      <CardContent className="space-y-6 pt-2">
        {permission === "denied" && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-tangerine/10 p-3 text-xs">
            <AlertCircle className="h-5 w-5 shrink-0 text-tangerine-dark" />
            <p>
              Browser notifications are blocked. To receive real-time updates, please allow notifications in your browser address bar settings.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="font-bold text-sm">Browser Push Notifications</p>
            <p className="text-xs text-ink/60">Receive desktop alerts when expenses are added or settled.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.pushEnabled}
            onClick={() => handleTogglePush(!preferences.pushEnabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-ink transition-colors ${preferences.pushEnabled ? "bg-lime" : "bg-paper"} shadow-brutal-sm`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full border-2 border-ink bg-white shadow transition-transform ${preferences.pushEnabled ? "translate-x-5" : "translate-x-0.5"} mt-0.5`} />
          </button>
        </div>

        <div className="space-y-3 pt-2 border-t-2 border-ink">
          <p className="font-display text-xs uppercase tracking-widest text-ink/60">Alert Triggers</p>
          
          <div className="flex items-center justify-between">
            <span className="text-sm">Expense Added</span>
            <input
              type="checkbox"
              checked={preferences.expenseAdded}
              onChange={(e) => {
                updatePreferences({ expenseAdded: e.target.checked });
                toast.success("Preference updated");
              }}
              className="h-5 w-5 rounded border-2 border-ink accent-lime"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Expense Settled</span>
            <input
              type="checkbox"
              checked={preferences.expenseSettled}
              onChange={(e) => {
                updatePreferences({ expenseSettled: e.target.checked });
                toast.success("Preference updated");
              }}
              className="h-5 w-5 rounded border-2 border-ink accent-lime"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">Expense Requested</span>
            <input
              type="checkbox"
              checked={preferences.expenseRequested}
              onChange={(e) => {
                updatePreferences({ expenseRequested: e.target.checked });
                toast.success("Preference updated");
              }}
              className="h-5 w-5 rounded border-2 border-ink accent-lime"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
