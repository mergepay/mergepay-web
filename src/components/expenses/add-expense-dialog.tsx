"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Input,
  Textarea,
  Label,
  Select,
  FieldHint,
  FormError,
} from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { shouldBlockExpenseSubmit, useCreateExpense } from "@/lib/queries";
import {
  createSubmissionGate,
  shouldSuppressSubmitKey,
  submitOnce,
} from "@/lib/submission";
import { api, ApiRequestError } from "@/lib/api";
import { SETTLEMENT_ASSETS, STABLE_ASSET } from "@/lib/constants";
import type { GroupMember, SplitType } from "@/lib/types";
import {
  MAX_PERCENT_DECIMAL_PLACES,
  sumDecimalStrings,
  validateExpenseSplit,
} from "@/lib/expenseValidation";
import { MAX_DECIMAL_PLACES, parseExactAmount } from "@/lib/money";

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
  // Single idempotency key per logical submission — rotated on success
  // so a second expense (without closing the dialog) gets a fresh key.
  const idemKey = useRef(crypto.randomUUID());
  // Guards state updates after the dialog unmounts mid-flight.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
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
  // Rendering state for the pending request — drives the spinner, the
  // busy announcement, and the disabled submit control.
  const [submitting, setSubmitting] = useState(false);
  // Error from the last failed attempt. Kept alongside the entered values
  // so the user can correct and retry without re-typing the form.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Synchronous single-flight latch. `submitting` and `create.isPending`
  // are React state and only settle on the next render, so they cannot by
  // themselves reject a second activation that lands in the same tick
  // (double-click, Enter auto-repeat, tap plus synthesised click).
  const gate = useRef(createSubmissionGate());

  const asset = useMemo(
    () => SETTLEMENT_ASSETS.find((a) => a.code === assetKey) ?? SETTLEMENT_ASSETS[0],
    [assetKey]
  );

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

  // A member removed from the group mid-edit can no longer be unchecked (their
  // row disappears), so drop them from the selection. Validation still rejects
  // stale ids on the render before this effect runs.
  useEffect(() => {
    setParticipants((prev) => {
      const next = prev.filter((id) => memberIds.includes(id));
      return next.length === prev.length ? prev : next;
    });
    setPayerUserId((prev) => {
      if (memberIds.includes(prev)) return prev;
      return memberIds.includes(currentUserId) ? currentUserId : memberIds[0] ?? "";
    });
  }, [memberIds, currentUserId]);

  const validation = useMemo(
    () =>
      validateExpenseSplit({
        title,
        amount,
        splitType,
        participants,
        custom,
        percent,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        eligibleParticipantIds: memberIds,
      }),
    [title, amount, splitType, participants, custom, percent, asset, memberIds]
  );
  const fieldErrors = validation.errors;
  const participantErrors = validation.participantErrors;

  // Exact running sums for the split hints — never floating point, so the hint
  // always agrees with the validation verdict.
  const customSum = useMemo(
    () => sumDecimalStrings(participants.map((id) => custom[id] ?? ""), MAX_DECIMAL_PLACES),
    [participants, custom]
  );
  const percentSum = useMemo(
    () =>
      sumDecimalStrings(
        participants.map((id) => percent[id] ?? ""),
        MAX_PERCENT_DECIMAL_PLACES
      ),
    [participants, percent]
  );
  const normalizedTotal = useMemo(() => {
    const parsed = parseExactAmount(amount);
    return parsed.ok ? parsed.value.plain : "0";
  }, [amount]);

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

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (shouldBlockExpenseSubmit({ isPending: create.isPending, submitting })) {
      return;
    }

    // No request is issued while the draft is invalid — the API is the second
    // line of defence, not the first source of feedback.
    if (!validation.valid || !validation.normalized) {
      const first =
        Object.values(validation.errors)[0] ??
        Object.values(validation.participantErrors)[0];
      if (first) toast.error(first);
      return;
    }

    const { title: cleanTitle, amount: cleanAmount, shares } = validation.normalized;

    // Every activation funnels through the gate: only the one that claims
    // it issues a request, so a form instance can never have two creates
    // in flight. The gate is released again on success *and* on failure.
    const attempt = await submitOnce(gate.current, async () => {
      setSubmitError(null);
      setSubmitting(true);
      try {
        return await create.mutateAsync({
          title: cleanTitle,
          description: description.trim() || undefined,
          amount: cleanAmount,
          assetCode: asset.code,
          assetIssuer: asset.issuer,
          splitType,
          shares,
          payerUserId,
          memo: memo.trim() || undefined,
          receiptUrl,
        });
      } finally {
        setSubmitting(false);
      }
    });

    if (attempt.status === "blocked") return;

    if (attempt.status === "error") {
      // Leave every entered value in place — the user corrects or retries
      // from where they were.
      const message =
        attempt.error instanceof ApiRequestError
          ? attempt.error.message
          : "Could not add expense. Your details were kept — try again.";
      setSubmitError(message);
      toast.error(message);
      return;
    }

    toast.success("Expense added");
    reset();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (
      shouldSuppressSubmitKey(e, submitting || create.isPending || gate.current.active)
    ) {
      // Suppress implicit and auto-repeat Enter submits while a mutation
      // is in flight; the native disabled state does not cover them.
      e.preventDefault();
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
    setSubmitError(null);
    setParticipants(memberIds);
    // Rotate idempotency key on success / explicit reset so a new
    // logical submission gets a fresh deduplication identity.
    idemKey.current = crypto.randomUUID();
  }

  // Preview only — the API performs the authoritative equal-split division.
  const equalSharePreview =
    participants.length > 0
      ? (Number(normalizedTotal) / participants.length).toFixed(2)
      : "0.00";

  /** A create request is in flight for this form instance. */
  const pending = create.isPending || submitting;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add expense"
      description="Record a shared bill and choose how it is split between group members."
    >
      <form
        onSubmit={submit}
        onKeyDown={handleKeyDown}
        aria-busy={pending}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="e-title">Title</Label>
          <Input
            id="e-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dinner at Terra Kulture"
            maxLength={80}
            data-autofocus
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? "e-title-error" : undefined}
          />
          {fieldErrors.title && (
            <p id="e-title-error" className="mt-1 text-xs text-flamingo" role="alert">
              {fieldErrors.title}
            </p>
          )}
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
              aria-invalid={fieldErrors.amount ? true : undefined}
              aria-describedby={fieldErrors.amount ? "e-amount-error" : undefined}
            />
            {fieldErrors.amount && (
              <p id="e-amount-error" className="mt-1 text-xs text-flamingo" role="alert">
                {fieldErrors.amount}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="e-asset">Asset</Label>
            <Select
              id="e-asset"
              value={assetKey}
              onChange={(e) => setAssetKey(e.target.value)}
              aria-invalid={fieldErrors.asset ? true : undefined}
              aria-describedby={fieldErrors.asset ? "e-asset-error" : undefined}
            >
              <option value="XLM">XLM (native)</option>
              <option value={STABLE_ASSET.code}>{STABLE_ASSET.code} (stable)</option>
            </Select>
            {fieldErrors.asset && (
              <p id="e-asset-error" className="mt-1 text-xs text-flamingo" role="alert">
                {fieldErrors.asset}
              </p>
            )}
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
              const rowError = on ? participantErrors[m.userId] : undefined;
              const errorId = rowError ? `e-share-${m.userId}-error` : undefined;
              return (
                <div key={m.userId}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 px-3 py-2 transition-colors",
                      rowError
                        ? "border-flamingo bg-flamingo-pale"
                        : on
                          ? "border-ink bg-cream"
                          : "border-ink/20 bg-paper opacity-60"
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
                        {equalSharePreview}
                      </span>
                    )}
                    {on && splitType === "custom" && (
                      <Input
                        type="number"
                        min="0"
                        step="0.0000001"
                        inputMode="decimal"
                        value={custom[m.userId] ?? ""}
                        onChange={(e) =>
                          setCustom((c) => ({ ...c, [m.userId]: e.target.value }))
                        }
                        className="h-8 w-24 px-2 py-1 text-sm"
                        placeholder="0.00"
                        aria-label={`Share amount for ${m.user.displayName}`}
                        aria-invalid={rowError ? true : undefined}
                        aria-describedby={errorId}
                      />
                    )}
                    {on && splitType === "percentage" && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          inputMode="decimal"
                          value={percent[m.userId] ?? ""}
                          onChange={(e) =>
                            setPercent((p) => ({ ...p, [m.userId]: e.target.value }))
                          }
                          className="h-8 w-16 px-2 py-1 text-sm"
                          placeholder="0"
                          aria-label={`Share percentage for ${m.user.displayName}`}
                          aria-invalid={rowError ? true : undefined}
                          aria-describedby={errorId}
                        />
                        <span className="text-xs text-ink/50">%</span>
                      </div>
                    )}
                  </div>
                  {rowError && (
                    <p id={errorId} className="mt-1 px-3 text-xs text-flamingo" role="alert">
                      {m.user.displayName}: {rowError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {fieldErrors.participants && (
            <p id="e-participants-error" className="mt-1 text-xs text-flamingo" role="alert">
              {fieldErrors.participants}
            </p>
          )}
          {splitType === "custom" && (
            <FieldHint>
              Sum: {customSum} / {normalizedTotal}{" "}
              {fieldErrors.custom && (
                <span className="text-flamingo font-bold">· {fieldErrors.custom}</span>
              )}
            </FieldHint>
          )}
          {splitType === "percentage" && (
            <FieldHint>
              Sum: {percentSum}% / 100%{" "}
              {fieldErrors.percent && (
                <span className="text-flamingo font-bold">· {fieldErrors.percent}</span>
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

          {submitError && (
            <div
              id="e-submit-error"
              role="alert"
              className="rounded-xl border-2 border-flamingo bg-flamingo/10 px-3 py-2 text-sm text-flamingo"
            >
              <FormError>{submitError}</FormError>
              <p className="mt-1 text-xs text-ink/60">
                Nothing was saved. Your details are still here — adjust them or
                press “Add expense” to try again.
              </p>
            </div>
          )}

          {/* Announce the in-flight request to assistive tech: the submit
              control's visual spinner is not enough on its own. */}
          <p role="status" aria-live="polite" className="sr-only">
            {pending ? "Adding expense, please wait" : ""}
          </p>

          <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={pending}
            disabled={!validation.valid || pending}
            title={
              validation.valid
                ? undefined
                : Object.values(validation.errors)[0] ??
                  Object.values(validation.participantErrors)[0]
            }
            aria-busy={pending}
            aria-describedby={submitError ? "e-submit-error" : undefined}
          >
            Add expense
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
