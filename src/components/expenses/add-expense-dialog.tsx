"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FieldHint } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCreateExpense } from "@/lib/queries";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errorHandler";
import { SETTLEMENT_ASSETS, STABLE_ASSET } from "@/lib/constants";
import type { GroupMember, SplitType, ExpenseShareInput } from "@/lib/types";
import {
  AMOUNT_DECIMAL_PLACES,
  MAX_TITLE_LENGTH,
  PERCENT_DECIMAL_PLACES,
  formatAmountUnits,
  formatDecimalUnits,
  parseDecimalUnits,
  splitEqualUnits,
  validateExpenseForm,
  expenseSplitSchema,
} from "@/lib/expenseValidation";
import { MAX_DECIMAL_PLACES, parseExactAmount } from "@/lib/money";
import { useWalletDisconnected } from "@/lib/wallet-store";
import { convertCurrency, currencyRate, rateDeviationPercent, SUPPORTED_FIAT_CURRENCIES, type SupportedFiatCurrency } from "@/lib/currency";

/** The asset codes the form offers, and the only ones validation accepts. */
const SUPPORTED_ASSET_CODES = SETTLEMENT_ASSETS.map((a) => a.code);

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
  const [fiatCurrency, setFiatCurrency] = useState<SupportedFiatCurrency>("USD");
  const [fiatAmount, setFiatAmount] = useState("");
  const [rateOverride, setRateOverride] = useState("");
  const [assetKey, setAssetKey] = useState("XLM");
  const [payerUserId, setPayerUserId] = useState(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [participants, setParticipants] = useState<string[]>(members.map((m) => m.userId));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [percent, setPercent] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Error from the last failed attempt. Kept alongside the entered values
  // so the user can correct and retry without re-typing the form.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Per-field "has been visited" marks, so a field only shows its error
  // once the user has left it rather than while they are still typing.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Set by a rejected submit attempt, which reveals every outstanding
  // error at once regardless of what has been touched.
  const [showErrors, setShowErrors] = useState(false);
  // Expenses are settled on-chain — block submission while the wallet is
  // disconnected.
  const walletDisconnected = useWalletDisconnected();

  /** Request in flight, by either the mutation or this form's own latch. */
  const pending = create.isPending || submitting;

  const asset = useMemo(
    () => SETTLEMENT_ASSETS.find((a) => a.code === assetKey) ?? SETTLEMENT_ASSETS[0],
    [assetKey]
  );

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

  /** The amount in stroops, or null while it is empty/invalid. */
  const amountUnits = useMemo(() => {
    const parsed = parseDecimalUnits(amount, AMOUNT_DECIMAL_PLACES);
    return typeof parsed === "bigint" && parsed > 0n ? parsed : null;
  }, [amount]);
  const marketRate = currencyRate(fiatCurrency);
  const effectiveRate = rateOverride.trim() ? Number(rateOverride) : marketRate;
  const convertedAmount = convertCurrency(fiatAmount, fiatCurrency, effectiveRate);
  const rateWarning = rateOverride.trim() && rateDeviationPercent(effectiveRate, marketRate) > 10;

  /** Running totals, summed as integers so the hints never drift. */
  const customSum = useMemo(
    () =>
      participants.reduce((sum, id) => {
        const parsed = parseDecimalUnits(custom[id] ?? "", AMOUNT_DECIMAL_PLACES);
        return typeof parsed === "bigint" ? sum + parsed : sum;
      }, 0n),
    [participants, custom]
  );
  const percentSum = useMemo(
    () =>
      participants.reduce((sum, id) => {
        const parsed = parseDecimalUnits(percent[id] ?? "", PERCENT_DECIMAL_PLACES);
        return typeof parsed === "bigint" ? sum + parsed : sum;
      }, 0n),
    [participants, percent]
  );

  /**
   * Exact per-participant shares for an equal split. The remainder is
   * distributed a stroop at a time rather than rounded away, and these
   * are the values shown next to each name.
   */
  const equalShares = useMemo(
    () =>
      amountUnits === null
        ? []
        : splitEqualUnits(amountUnits, participants.length),
    [amountUnits, participants.length]
  );
  const equalSplitIsUneven =
    equalShares.length > 1 &&
    equalShares.some((s) => s !== equalShares[0]);

  const validationErrors = useMemo(
    () =>
      validateExpenseForm(
        {
          title,
          amount,
          assetCode: assetKey,
          splitType,
          payerUserId,
          participants,
          custom,
          percent,
        },
        { memberIds, supportedAssetCodes: SUPPORTED_ASSET_CODES }
      ),
    [
      title,
      amount,
      assetKey,
      splitType,
      payerUserId,
      participants,
      custom,
      percent,
      memberIds,
    ]
  );

  /** The message to render for a field, or undefined while it is hidden. */
  function errorFor(field: string): string | undefined {
    if (!showErrors && !touched[field]) return undefined;
    return validationErrors?.[field];
  }

  function markTouched(field: string) {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  }

  function toggleParticipant(id: string) {
    markTouched("participants");
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
      handleApiError(e, "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (create.isPending || submitting) return;
    // No API request is made while anything is invalid — the button is
    // also disabled, but a keyboard submit can still reach this handler.
    if (validationErrors) {
      const first = Object.values(validationErrors)[0];
      toast.error(first);
      setShowErrors(true);
      return;
    }
    if (amountUnits === null) return;

    const shares: ExpenseShareInput[] = participants.map((userId) => {
      if (splitType === "custom") {
        const units = parseDecimalUnits(
          custom[userId] ?? "",
          AMOUNT_DECIMAL_PLACES
        );
        // Validation already rejected anything unparseable.
        return {
          userId,
          amount: formatAmountUnits(typeof units === "bigint" ? units : 0n),
        };
      }
      if (splitType === "percentage")
        return { userId, percent: Number(percent[userId] ?? "0") };
      return { userId };
    });
    const splitCheck = expenseSplitSchema.safeParse({ amount: formatAmountUnits(amountUnits), splitType, shares });
    if (!splitCheck.success) {
      toast.error(splitCheck.error.issues[0]?.message ?? "Check the split allocations");
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        // Sent from the parsed integer amount, so what reaches the API is
        // exactly what was typed — never a float round-trip.
        amount: formatAmountUnits(amountUnits),
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
      // Leave every entered value in place — the user corrects or retries
      // from where they were. The central handler owns the toast and the
      // message; it is also rendered inline inside the dialog.
      const message = handleApiError(
        e,
        "Could not add expense. Your details were kept — try again."
      );
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setTitle("");
    setDescription("");
    setAmount("");
    setFiatCurrency("USD");
    setFiatAmount("");
    setRateOverride("");
    setSplitType("equal");
    setCustom({});
    setPercent({});
    setMemo("");
    setReceiptUrl(null);
    setParticipants(members.map((m) => m.userId));
    setTouched({});
    setShowErrors(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add expense">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="e-title">Title</Label>
          <Input
            id="e-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => markTouched("title")}
            placeholder="Dinner at Terra Kulture"
            maxLength={MAX_TITLE_LENGTH}
            autoFocus
            aria-invalid={errorFor("title") ? true : undefined}
            aria-describedby={errorFor("title") ? "e-title-error" : undefined}
          />
          {errorFor("title") && (
            <p id="e-title-error" className="mt-1 text-xs text-flamingo" role="alert">
              {errorFor("title")}
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
              onBlur={() => markTouched("amount")}
              placeholder="0.00"
              aria-invalid={errorFor("amount") ? true : undefined}
              aria-describedby={errorFor("amount") ? "e-amount-error" : undefined}
            />
            {errorFor("amount") && (
              <p id="e-amount-error" className="mt-1 text-xs text-flamingo" role="alert">
                {errorFor("amount")}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="e-asset">Asset</Label>
            <Select
              id="e-asset"
              value={assetKey}
              onChange={(e) => setAssetKey(e.target.value)}
              onBlur={() => markTouched("assetCode")}
              aria-invalid={errorFor("assetCode") ? true : undefined}
              aria-describedby={
                errorFor("assetCode") ? "e-asset-error" : undefined
              }
            >
              {SETTLEMENT_ASSETS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code}
                  {a.code === "XLM"
                    ? " (native)"
                    : a.code === STABLE_ASSET.code
                    ? " (stable)"
                    : ""}
                </option>
              ))}
            </Select>
            {errorFor("assetCode") && (
              <p id="e-asset-error" className="mt-1 text-xs text-flamingo" role="alert">
                {errorFor("assetCode")}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl border-2 border-ink bg-butter p-3 shadow-brutal-sm">
          <p className="font-display text-xs font-bold uppercase tracking-wide">Currency converter</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input aria-label="Foreign currency amount" type="number" min="0" step="any" value={fiatAmount} onChange={(e) => setFiatAmount(e.target.value)} placeholder="Local amount" />
            <Select aria-label="Foreign currency" value={fiatCurrency} onChange={(e) => setFiatCurrency(e.target.value as SupportedFiatCurrency)}>
              {SUPPORTED_FIAT_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </Select>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input aria-label="Manual conversion rate" type="number" min="0" step="any" value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} placeholder={`Rate (${marketRate})`} />
            <Button type="button" variant="secondary" disabled={!convertedAmount} onClick={() => convertedAmount && setAmount(convertedAmount)}>Apply</Button>
          </div>
          <p className="mt-2 text-xs" aria-live="polite">{convertedAmount ? `${fiatAmount || "0"} ${fiatCurrency} ≈ ${convertedAmount} ${assetKey} (rate ${effectiveRate})` : "Enter an amount to preview the conversion."}</p>
          {rateWarning && <p className="mt-1 text-xs font-bold text-flamingo" role="alert">Manual rate differs from the indicative rate by more than 10%.</p>}
        </div>
        <div>
          <Label htmlFor="e-payer">Paid by</Label>
          <Select
            id="e-payer"
            value={payerUserId}
            onChange={(e) => setPayerUserId(e.target.value)}
            onBlur={() => markTouched("payer")}
            aria-invalid={errorFor("payer") ? true : undefined}
            aria-describedby={errorFor("payer") ? "e-payer-error" : undefined}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.displayName}
                {m.userId === currentUserId ? " (you)" : ""}
              </option>
            ))}
          </Select>
          {errorFor("payer") && (
            <p id="e-payer-error" className="mt-1 text-xs text-flamingo" role="alert">
              {errorFor("payer")}
            </p>
          )}
        </div>
        <div>
          <Label>Split</Label>
          <div className="flex gap-2" role="group" aria-label="Split type">
            {(["equal", "custom", "percentage"] as SplitType[]).map((t) => <button key={t} type="button" onClick={() => setSplitType(t)} aria-pressed={splitType === t} className={cn("flex-1 rounded-xl border-2 border-ink py-2 font-display text-xs uppercase tracking-wide shadow-brutal-sm transition-all", splitType === t ? "bg-grape text-white" : "bg-cream hover:bg-butter")}>{t}</button>)}
          </div>
        </div>
        <div>
          <Label>Participants</Label>
          <div
            className="space-y-2"
            aria-describedby={
              errorFor("participants") ? "e-participants-error" : undefined
            }
          >
            {members.map((m) => {
              const on = participants.includes(m.userId);
              const shareIndex = participants.indexOf(m.userId);
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
                      {equalShares[shareIndex] === undefined
                        ? "—"
                        : formatAmountUnits(equalShares[shareIndex])}
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
                      onBlur={() => markTouched("custom")}
                      className="h-8 w-24 px-2 py-1 text-sm"
                      placeholder="0.00"
                      aria-label={`Share for ${m.user.displayName}`}
                      aria-invalid={errorFor("custom") ? true : undefined}
                      aria-describedby={
                        errorFor("custom") ? "e-custom-error" : undefined
                      }
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
                        onBlur={() => markTouched("percent")}
                        className="h-8 w-16 px-2 py-1 text-sm"
                        placeholder="0"
                        aria-label={`Percentage for ${m.user.displayName}`}
                        aria-invalid={errorFor("percent") ? true : undefined}
                        aria-describedby={
                          errorFor("percent") ? "e-percent-error" : undefined
                        }
                      />
                      <span className="text-xs text-ink/50">%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {errorFor("participants") && (
            <p id="e-participants-error" className="mt-1 text-xs text-flamingo" role="alert">
              {errorFor("participants")}
            </p>
          )}
          {splitType === "equal" && equalSplitIsUneven && (
            <FieldHint>
              This amount doesn&apos;t divide evenly. The remainder is added to
              the first {equalShares.filter((s) => s === equalShares[0]).length}{" "}
              participant(s) so the shares still add up to the full amount.
            </FieldHint>
          )}
          {splitType === "custom" && (
            <>
              <FieldHint>
                Sum: {formatAmountUnits(customSum)} /{" "}
                {amountUnits === null ? "—" : formatAmountUnits(amountUnits)}
              </FieldHint>
              {errorFor("custom") && (
                <p id="e-custom-error" className="mt-1 text-xs text-flamingo" role="alert">
                  {errorFor("custom")}
                </p>
              )}
            </>
          )}
          {splitType === "percentage" && (
            <>
              <FieldHint>
                Sum: {formatDecimalUnits(percentSum, PERCENT_DECIMAL_PLACES)}% /
                100%
              </FieldHint>
              {errorFor("percent") && (
                <p id="e-percent-error" className="mt-1 text-xs text-flamingo" role="alert">
                  {errorFor("percent")}
                </p>
              )}
            </>
          )}
        </div>
        <div>
          <Label htmlFor="e-memo">Memo reference (optional)</Label>
          <Input id="e-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Auto-generated if blank" maxLength={24} />
          <FieldHint>Attached to each Stellar settlement for this expense.</FieldHint>
        </div>
        <div>
          <Label>Receipt (optional)</Label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-ink bg-paper px-4 py-3 text-sm hover:bg-cream">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {receiptUrl ? "Receipt attached — replace" : "Upload image or PDF"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
          </label>
        </div>

        {/* Single announcement point for the first outstanding problem,
            so a screen reader hears why the form will not submit. */}
        <p className="sr-only" role="status" aria-live="polite">
          {showErrors && validationErrors
            ? `This expense can't be saved yet: ${
                Object.values(validationErrors)[0]
              }`
            : ""}
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={pending}
            disabled={validationErrors !== null || pending || walletDisconnected}
            title={
              walletDisconnected
                ? "Reconnect your wallet to add an expense"
                : validationErrors
                  ? Object.values(validationErrors)[0]
                  : undefined
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
