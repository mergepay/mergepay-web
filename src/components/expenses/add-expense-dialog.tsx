"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label, Select, FieldHint } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCreateExpense } from "@/lib/queries";
import { api, ApiRequestError } from "@/lib/api";
import { SETTLEMENT_ASSETS, STABLE_ASSET } from "@/lib/constants";
import type { GroupMember, SplitType, ExpenseShareInput } from "@/lib/types";

export function AddExpenseDialog({
  open,
  onClose,
  groupId,
  members,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
}) {
  const create = useCreateExpense(groupId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [assetKey, setAssetKey] = useState("XLM");
  const [payerUserId, setPayerUserId] = useState(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [participants, setParticipants] = useState<string[]>(
    members.map((m) => m.userId)
  );
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [percent, setPercent] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const asset = useMemo(
    () => SETTLEMENT_ASSETS.find((a) => a.code === assetKey) ?? SETTLEMENT_ASSETS[0],
    [assetKey]
  );

  const total = parseFloat(amount) || 0;

  const customSum = useMemo(
    () =>
      participants.reduce((s, id) => s + (parseFloat(custom[id] || "0") || 0), 0),
    [participants, custom]
  );
  const percentSum = useMemo(
    () =>
      participants.reduce((s, id) => s + (parseFloat(percent[id] || "0") || 0), 0),
    [participants, percent]
  );

  function toggleParticipant(id: string) {
    setParticipants((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    );
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const res = await api.uploadReceipt(file);
      setReceiptUrl(res.url);
      toast.success("Receipt attached");
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function validate(): string | null {
    if (!title.trim()) return "Add a title";
    if (total <= 0) return "Enter an amount greater than zero";
    if (participants.length === 0) return "Pick at least one participant";
    if (splitType === "custom" && Math.abs(customSum - total) > 0.0000001)
      return `Custom amounts must sum to ${total}`;
    if (splitType === "percentage" && Math.abs(percentSum - 100) > 0.001)
      return "Percentages must sum to 100";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    const shares: ExpenseShareInput[] = participants.map((userId) => {
      if (splitType === "custom") return { userId, amount: custom[userId] || "0" };
      if (splitType === "percentage")
        return { userId, percent: parseFloat(percent[userId] || "0") };
      return { userId };
    });

    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        amount: String(total),
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        splitType,
        shares,
        payerUserId,
        memo: memo.trim() || undefined,
        receiptUrl,
      });
      toast.success("Expense added");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not add expense");
    }
  }

  function reset() {
    setTitle("");
    setDescription("");
    setAmount("");
    setSplitType("equal");
    setCustom({});
    setPercent({});
    setMemo("");
    setReceiptUrl(null);
    setParticipants(members.map((m) => m.userId));
  }

  const equalShare =
    participants.length > 0 ? total / participants.length : 0;

  return (
    <Dialog open={open} onClose={onClose} title="Add expense">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="e-title">Title</Label>
          <Input
            id="e-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dinner at Terra Kulture"
            maxLength={80}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="e-amount">Amount</Label>
            <Input
              id="e-amount"
              type="number"
              min="0"
              step="0.0000001"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="e-asset">Asset</Label>
            <Select
              id="e-asset"
              value={assetKey}
              onChange={(e) => setAssetKey(e.target.value)}
            >
              <option value="XLM">XLM (native)</option>
              <option value={STABLE_ASSET.code}>{STABLE_ASSET.code} (stable)</option>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="e-payer">Paid by</Label>
          <Select
            id="e-payer"
            value={payerUserId}
            onChange={(e) => setPayerUserId(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.displayName}
                {m.userId === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Split</Label>
          <div className="flex gap-2">
            {(["equal", "custom", "percentage"] as SplitType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSplitType(t)}
                className={cn(
                  "flex-1 rounded-xl border-2 border-ink py-2 font-display text-xs uppercase tracking-wide shadow-brutal-sm transition-all",
                  splitType === t ? "bg-grape text-white" : "bg-cream hover:bg-butter"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Participants</Label>
          <div className="space-y-2">
            {members.map((m) => {
              const on = participants.includes(m.userId);
              return (
                <div
                  key={m.userId}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border-2 px-3 py-2 transition-colors",
                    on ? "border-ink bg-cream" : "border-ink/20 bg-paper opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleParticipant(m.userId)}
                    className="h-4 w-4 accent-grape"
                    aria-label={`Include ${m.user.displayName}`}
                  />
                  <Avatar user={m.user} size="sm" />
                  <span className="flex-1 truncate text-sm font-bold">
                    {m.user.displayName}
                    {m.userId === currentUserId && (
                      <span className="ml-1 text-ink/40">(you)</span>
                    )}
                  </span>
                  {on && splitType === "equal" && (
                    <span className="font-mono text-xs text-ink/60">
                      {equalShare.toFixed(2)}
                    </span>
                  )}
                  {on && splitType === "custom" && (
                    <Input
                      type="number"
                      min="0"
                      step="0.0000001"
                      value={custom[m.userId] ?? ""}
                      onChange={(e) =>
                        setCustom((c) => ({ ...c, [m.userId]: e.target.value }))
                      }
                      className="h-8 w-24 px-2 py-1 text-sm"
                      placeholder="0.00"
                    />
                  )}
                  {on && splitType === "percentage" && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={percent[m.userId] ?? ""}
                        onChange={(e) =>
                          setPercent((p) => ({ ...p, [m.userId]: e.target.value }))
                        }
                        className="h-8 w-16 px-2 py-1 text-sm"
                        placeholder="0"
                      />
                      <span className="text-xs text-ink/50">%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {splitType === "custom" && (
            <FieldHint>
              Sum: {customSum.toFixed(2)} / {total.toFixed(2)}{" "}
              {Math.abs(customSum - total) > 0.0000001 && total > 0 && (
                <span className="text-flamingo font-bold">· must match total</span>
              )}
            </FieldHint>
          )}
          {splitType === "percentage" && (
            <FieldHint>
              Sum: {percentSum.toFixed(1)}% / 100%{" "}
              {Math.abs(percentSum - 100) > 0.001 && (
                <span className="text-flamingo font-bold">· must total 100</span>
              )}
            </FieldHint>
          )}
        </div>

        <div>
          <Label htmlFor="e-memo">Memo reference (optional)</Label>
          <Input
            id="e-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Auto-generated if blank"
            maxLength={24}
          />
          <FieldHint>Attached to each Stellar settlement for this expense.</FieldHint>
        </div>

        <div>
          <Label>Receipt (optional)</Label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-ink bg-paper px-4 py-3 text-sm hover:bg-cream">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {receiptUrl ? "Receipt attached — replace" : "Upload image or PDF"}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Add expense
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
