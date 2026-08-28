"use client";

import { useState, useMemo } from "react";
import { addDays, addWeeks, addMonths, format } from "date-fns";
import { Calendar, Clock, Play, Pause, Trash2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Money } from "@/components/amount";
import type { GroupMember, SplitType } from "@/lib/types";

export type RecurrenceInterval = "weekly" | "biweekly" | "monthly" | "custom";

export interface RecurringExpenseSchedule {
  id: string;
  groupId: string;
  title: string;
  amount: string;
  assetCode: string;
  interval: RecurrenceInterval;
  intervalDays?: number;
  startDate: string;
  nextRunDate: string;
  active: boolean;
  payerUserId: string;
}

export function computeNextRunDate(
  startDate: Date,
  interval: RecurrenceInterval,
  intervalDays: number = 30
): Date {
  const now = new Date();
  let next = new Date(startDate);

  while (next <= now) {
    if (interval === "weekly") {
      next = addWeeks(next, 1);
    } else if (interval === "biweekly") {
      next = addWeeks(next, 2);
    } else if (interval === "monthly") {
      next = addMonths(next, 1);
    } else {
      next = addDays(next, Math.max(1, intervalDays));
    }
  }

  return next;
}

export function RecurringExpenseScheduler({
  groupId,
  members,
  currentUserId,
}: {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
}) {
  const [schedules, setSchedules] = useState<RecurringExpenseSchedule[]>([
    {
      id: "rec-1",
      groupId,
      title: "Apartment Rent & Utilities",
      amount: "450.0000000",
      assetCode: "USDC",
      interval: "monthly",
      startDate: new Date().toISOString(),
      nextRunDate: addMonths(new Date(), 1).toISOString(),
      active: true,
      payerUserId: currentUserId,
    },
  ]);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [assetCode, setAssetCode] = useState("USDC");
  const [interval, setInterval] = useState<RecurrenceInterval>("monthly");
  const [customDays, setCustomDays] = useState("30");

  const previewNextDate = useMemo(() => {
    return computeNextRunDate(
      new Date(),
      interval,
      Number(customDays) || 30
    );
  }, [interval, customDays]);

  function handleCreateSchedule() {
    if (!title.trim() || !amount.trim() || Number(amount) <= 0) {
      toast.error("Please enter a valid title and positive amount");
      return;
    }

    const newSchedule: RecurringExpenseSchedule = {
      id: `rec-${Date.now()}`,
      groupId,
      title: title.trim(),
      amount: Number(amount).toFixed(7),
      assetCode,
      interval,
      intervalDays: interval === "custom" ? Number(customDays) : undefined,
      startDate: new Date().toISOString(),
      nextRunDate: previewNextDate.toISOString(),
      active: true,
      payerUserId: currentUserId,
    };

    setSchedules((prev) => [...prev, newSchedule]);
    setOpen(false);
    setTitle("");
    setAmount("");
    toast.success("Recurring expense schedule created!");
  }

  function toggleSchedule(id: string) {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
    toast.info("Schedule status updated");
  }

  function deleteSchedule(id: string) {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    toast.success("Recurring schedule removed");
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between border-b-3 border-ink bg-cream px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-grape" />
          <h2 className="font-display text-sm uppercase tracking-widest">
            Recurring Expenses &amp; Reminders
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Schedule Expense
        </Button>
      </div>

      <CardContent className="space-y-3 pt-4">
        {schedules.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink/60">
            No recurring expense schedules configured for this group.
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between rounded-lg border-2 border-ink bg-paper p-3 shadow-hard-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold">{schedule.title}</span>
                    <Badge tone={schedule.active ? "aqua" : "paper"}>
                      {schedule.active ? "Active" : "Paused"}
                    </Badge>
                    <Badge tone="grape" className="capitalize">
                      {schedule.interval}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink/60">
                    <Money value={schedule.amount} assetCode={schedule.assetCode} />
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Next due: {format(new Date(schedule.nextRunDate), "MMM dd, yyyy")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleSchedule(schedule.id)}
                    title={schedule.active ? "Pause schedule" : "Resume schedule"}
                  >
                    {schedule.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteSchedule(schedule.id)}
                    title="Delete schedule"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-coral" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule Recurring Expense"
        description="Automate repetitive expenses and notify group participants on schedule."
      >
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label htmlFor="rec-title">Expense Title</Label>
            <Input
              id="rec-title"
              placeholder="e.g. Monthly Wifi Bill"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rec-amount">Amount</Label>
              <Input
                id="rec-amount"
                type="number"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-asset">Asset</Label>
              <Select
                id="rec-asset"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value)}
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
                <option value="EURC">EURC</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="rec-interval">Recurrence Frequency</Label>
            <Select
              id="rec-interval"
              value={interval}
              onChange={(e) => setInterval(e.target.value as RecurrenceInterval)}
            >
              <option value="weekly">Weekly (Every 7 days)</option>
              <option value="biweekly">Bi-weekly (Every 14 days)</option>
              <option value="monthly">Monthly (Every 1 month)</option>
              <option value="custom">Custom Interval (Days)</option>
            </Select>
          </div>

          {interval === "custom" && (
            <div className="space-y-1">
              <Label htmlFor="rec-days">Every X Days</Label>
              <Input
                id="rec-days"
                type="number"
                min="1"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
              />
            </div>
          )}

          <div className="rounded-lg border-2 border-ink bg-aqua/20 p-3 text-xs">
            <div className="flex items-center gap-2 font-bold text-ink">
              <Calendar className="h-4 w-4 text-grape" />
              <span>Next Run Date Preview: {format(previewNextDate, "MMMM dd, yyyy")}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSchedule}>
              Create Schedule
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}