"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReceiptUploader } from "@/components/ui/receipt-uploader";
import { Input, Label, Select, FieldHint } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCreateExpense } from "@/lib/queries";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errorHandler";
import { SETTLEMENT_ASSETS, SETTLEMENT_MEMO_PREFIX } from "@/lib/constants";
import { AssetSelector } from "@/components/expenses/AssetSelector";
import { ExpenseSplitPreview } from "@/components/expenses/ExpenseSplitPreview";
import { SplitCalculator, type SplitCalculatorChange } from "@/components/expenses/SplitCalculator";
import type { CreateExpenseRequest, GroupMember, SplitType, ExpenseShareInput } from "@/lib/types";
import {
  AMOUNT_DECIMAL_PLACES,
  MAX_TITLE_LENGTH,
  PERCENT_DECIMAL_PLACES,
  amountFieldError,
  formatAmountUnits,
  formatDecimalUnits,
  isBlockedDecimalKey,
  isTypableAmount,
  parseDecimalUnits,
  splitEqualUnits,
  validateExpenseForm,
} from "@/lib/expenseValidation";
import { expenseFormSchema } from "@/lib/validations/expense";
import { expenseCreationSchema } from "@/lib/validation";
import { MAX_DECIMAL_PLACES, parseExactAmount } from "@/lib/money";
import { useWalletDisconnected } from "@/lib/wallet-store";
import { convertCurrency, currencyRate, rateDeviationPercent, SUPPORTED_FIAT_CURRENCIES, type SupportedFiatCurrency } from "@/lib/currency";
import { useLocalStorageDraft } from "@/lib/useLocalStorageDraft";
import { parseExpenseDeepLink } from "@/lib/deepLink";
import { useOfflineStore } from "@/lib/store/offlineStore";
import { useAssetStore, isActiveAsset, type ActiveAsset } from "@/lib/asset-store";
import { createIdempotencyKey } from "@/lib/submission";

const SUPPORTED_ASSET_CODES = SETTLEMENT_ASSETS.map((a) => a.code);

/**
 * Map the persisted preference onto an asset this dialog can actually submit.
 * Unknown or corrupt codes collapse to XLM, matching the store's own fallback.
 */
function supportedAssetKey(asset: ActiveAsset): string {
  return isActiveAsset(asset) && SUPPORTED_ASSET_CODES.includes(asset.code)
    ? asset.code
    : SUPPORTED_ASSET_CODES[0];
}

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
  const activeAsset = useAssetStore((s) => s.activeAsset);
  const setActiveAsset = useAssetStore((s) => s.setActiveAsset);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [fiatCurrency, setFiatCurrency] = useState<SupportedFiatCurrency>("USD");
  const [fiatAmount, setFiatAmount] = useState("");
  const [rateOverride, setRateOverride] = useState("");
  // Seed from the persisted preference (#486) so a USDC choice made anywhere in
  // the app — or in a previous session — is what this dialog opens on.
  const [assetKey, setAssetKey] = useState(() => supportedAssetKey(activeAsset));
  const [payerUserId, setPayerUserId] = useState(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [participants, setParticipants] = useState<string[]>(() => members.map((m) => m.userId));
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [percent, setPercent] = useState<Record<string, string>>({});
  // Bumped when a draft is restored so the calculator remounts with its values.
  const [calculatorKey, setCalculatorKey] = useState(0);
  const [memo, setMemo] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { draft, isRestored, saveDraft, clearDraft, acknowledgeRestored } = useLocalStorageDraft(groupId);

  useEffect(() => {
    if (draft && isRestored) {
      if (draft.title) setTitle(draft.title);
      if (draft.description) setDescription(draft.description);
      if (draft.amount) setAmount(draft.amount);
      if (draft.fiatCurrency) setFiatCurrency(draft.fiatCurrency as SupportedFiatCurrency);
      if (draft.fiatAmount) setFiatAmount(draft.fiatAmount);
      if (draft.rateOverride) setRateOverride(draft.rateOverride);
      if (draft.assetKey) setAssetKey(draft.assetKey);
      if (draft.payerUserId) setPayerUserId(draft.payerUserId);
      if (draft.splitType) setSplitType(draft.splitType as SplitType);
      if (draft.participants?.length) setParticipants(draft.participants);
      if (draft.custom) setCustom(draft.custom);
      if (draft.percent) setPercent(draft.percent);
      if (draft.memo) setMemo(draft.memo);
      setCalculatorKey((k) => k + 1);
    }
  }, [draft, isRestored]);

  useEffect(() => {
    if (title || amount || description || memo) {
      saveDraft({
        title,
        description,
        amount,
        fiatCurrency,
        fiatAmount,
        rateOverride,
        assetKey,
        payerUserId,
        splitType,
        participants,
        custom,
        percent,
        memo,
      });
    }
  }, [title, description, amount, fiatCurrency, fiatAmount, rateOverride, assetKey, payerUserId, splitType, participants, custom, percent, memo, saveDraft]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showErrors, setShowErrors] = useState(false);

  // The dialog mounts as soon as the group page opens, which is usually before
  // the group's members have loaded — so `participants` starts empty and never
  // picks up the list. Adopt members as they arrive while nothing is selected
  // yet, and drop anyone who has left the group; a deliberate selection is left
  // alone. Without this, a cold visit to a group offers no participants and the
  // expense cannot be created at all.
  useEffect(() => {
    const memberIdsNow = members.map((m) => m.userId);
    setParticipants((current) => {
      if (current.length === 0) return memberIdsNow;
      const known = new Set(memberIdsNow);
      const stillMembers = current.filter((id) => known.has(id));
      if (stillMembers.length === current.length) return current;
      return stillMembers.length > 0 ? stillMembers : memberIdsNow;
    });
  }, [members]);

  const walletDisconnected = useWalletDisconnected();
  // The offline store is the single source of truth for connectivity (the
  // network listeners in AppShell keep it current), so the form and the sync
  // runner agree on whether it is safe to post.
  const isOnline = useOfflineStore((s) => s.isOnline);
  const isOffline = !isOnline;
  // Offline no longer blocks recording an expense — it queues the draft. A
  // connected wallet is still required because the request needs the session.
  const submitBlocked = walletDisconnected;

  const pending = create.isPending || submitting;

  /**
   * Update the local field and the persisted preference together, so the
   * currency toggle stays put across dialogs and page reloads (#486).
   */
  function selectAssetKey(key: string) {
    const next = SUPPORTED_ASSET_CODES.includes(key) ? key : SUPPORTED_ASSET_CODES[0];
    setAssetKey(next);
    const assetDef = SETTLEMENT_ASSETS.find((a) => a.code === next);
    if (assetDef) {
      setActiveAsset({ code: assetDef.code, issuer: assetDef.issuer });
    }
  }

  const asset = useMemo(
    () => SETTLEMENT_ASSETS.find((a) => a.code === assetKey) ?? SETTLEMENT_ASSETS[0],
    [assetKey]
  );

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

  const calculatorParticipants = useMemo(
    () =>
      participants.map((id) => ({
        userId: id,
        displayName: members.find((m) => m.userId === id)?.user.displayName ?? id,
      })),
    [participants, members]
  );

  const calculatorInitialValues = useMemo(
    () =>
      Object.fromEntries(
        participants.map((id) => [id, { amount: custom[id], percent: percent[id] }])
      ),
    // Only read when the calculator (re)mounts, i.e. when `calculatorKey` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calculatorKey]
  );

  function handleSplitChange(change: SplitCalculatorChange) {
    setSplitType(change.mode);
    if (change.mode === "custom") {
      setCustom(Object.fromEntries(change.shares.map((s) => [s.userId, s.amount ?? ""])));
    } else if (change.mode === "percentage") {
      setPercent(Object.fromEntries(change.shares.map((s) => [s.userId, String(s.percent ?? "")])));
    }
  }

  const sharesPayload = useMemo((): ExpenseShareInput[] => {
    if (splitType === "equal") {
      return participants.map((userId) => ({ userId }));
    }
    if (splitType === "custom") {
      return participants.map((userId) => ({
        userId,
        amount: custom[userId] || "0",
      }));
    }
    return participants.map((userId) => ({
      userId,
      percent: Number(percent[userId] || 0),
    }));
  }, [splitType, participants, custom, percent]);

  /** The amount in stroops, or null while it is empty/invalid. */
  const amountUnits = useMemo(() => {
    const parsed = parseDecimalUnits(amount, AMOUNT_DECIMAL_PLACES);
    return typeof parsed === "bigint" && parsed > 0n ? parsed : null;
  }, [amount]);
  const marketRate = currencyRate(fiatCurrency);
  // The converter previews an amount, so it holds both of its fields to the
  // same rules the amount field does. An unusable manual rate falls back to the
  // market rate rather than pushing NaN through the preview, and an unusable
  // local amount produces no preview at all — `Number()` would otherwise accept
  // exponent notation and negatives that no Stellar payment can carry.
  const fiatError = amountFieldError(fiatAmount);
  const rateError = amountFieldError(rateOverride);
  const hasRateOverride = rateOverride.trim() !== "" && !rateError;
  const effectiveRate = hasRateOverride ? Number(rateOverride) : marketRate;
  const convertedAmount = fiatError ? null : convertCurrency(fiatAmount, fiatCurrency, effectiveRate);
  // A converted zero has nowhere to go: applying it would only move the
  // invalid value into the amount field.
  const canApply = convertedAmount !== null && Number(convertedAmount) > 0;
  const rateWarning =
    hasRateOverride && rateDeviationPercent(effectiveRate, marketRate) > 10;

  // Use Zod schema validation
  const validationResult = useMemo(() => {
    const payload = {
      title,
      description: description || undefined,
      amount,
      assetCode: asset.code,
      assetIssuer: asset.issuer,
      splitType,
      shares: sharesPayload,
      payerUserId,
      memo: memo || undefined,
      receiptUrl,
    };
    return expenseFormSchema.safeParse(payload);
  }, [title, description, amount, asset, splitType, sharesPayload, payerUserId, memo, receiptUrl]);

  const fieldErrors = useMemo(() => {
    if (validationResult.success) return {};
    const map: Record<string, string> = {};
    for (const issue of validationResult.error.issues) {
      const key = issue.path[0]?.toString() || "form";
      if (!map[key]) {
        map[key] = issue.message;
      }
    }
    return map;
  }, [validationResult]);

  function getError(field: string): string | undefined {
    if (!showErrors && !touched[field]) return undefined;
    return fieldErrors[field];
  }

  function markTouched(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    setSubmitError(null);

    if (!validationResult.success) {
      toast.error("Please fix the errors before submitting");
      return;
    }

    if (submitBlocked) {
      return;
    }

    // Final runtime gate on the exact payload about to be dispatched (#315):
    // a malformed amount, an invalid asset code, or a split that does not add
    // up is rejected here — with a descriptive message — before mergepay-api
    // ever sees the request.
    const payload = expenseCreationSchema.safeParse({
      title: title.trim(),
      description: description.trim() || undefined,
      amount,
      assetCode: asset.code,
      assetIssuer: asset.issuer,
      splitType,
      shares: sharesPayload,
      payerUserId,
      memo: memo.trim() || undefined,
      receiptUrl,
    });
    if (!payload.success) {
      toast.error(payload.error.issues[0]?.message ?? "Please fix the errors before submitting");
      return;
    }

    // Offline: persist the draft in the queue; the sync runner posts it (with
    // its idempotency key) the moment the connection returns.
    if (isOffline) {
      useOfflineStore.getState().enqueue(groupId, payload.data);
      clearDraft();
      reset();
      toast.success(
        "Saved offline — this expense will sync when you're back online"
      );
      onClose();
      return;
    }

    try {
      setSubmitting(true);
      await create.mutateAsync({
        ...payload.data,
        // Makes the bounded retries in `useCreateExpense` (and a manual retry
        // after a timeout) safe: the server deduplicates them into one row.
        idempotencyKey: createIdempotencyKey(),
      });
      clearDraft();
      // Success toast is fired by the useCreateExpense hook's onSuccess handler.
      onClose();
    } catch (err) {
      // The hook's onError already toasted; extract the message silently so
      // we can render it inline without showing a second toast.
      const msg = handleApiError(err, "Could not create expense", { silent: true });
      setSubmitError(msg);
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
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Expense"
      description="Create a new shared expense for this group."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="rounded-xl border-3 border-ink bg-flamingo-pale p-3 text-sm font-bold text-ink shadow-brutal-sm">
            {submitError}
          </div>
        )}

        <div>
          <Label htmlFor="expense-title">Title</Label>
          <Input
            id="expense-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => markTouched("title")}
            placeholder="e.g. Dinner at Terra Kulture"
            className={getError("title") ? "border-flamingo" : undefined}
          />
          {getError("title") && (
            <p className="mt-1 text-xs font-bold text-flamingo-dark">{getError("title")}</p>
          )}
        </div>
        <div className="rounded-xl border-2 border-ink bg-butter p-3 shadow-brutal-sm">
          <p className="font-display text-xs font-bold uppercase tracking-wide">Currency converter</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <Input
                aria-label="Foreign currency amount"
                inputMode="decimal"
                autoComplete="off"
                value={fiatAmount}
                onChange={(e) => {
                  if (isTypableAmount(e.target.value)) setFiatAmount(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (isBlockedDecimalKey(e.key)) e.preventDefault();
                }}
                placeholder="Local amount"
                aria-invalid={fiatError ? true : undefined}
                aria-describedby={fiatError ? "fiat-amount-error" : undefined}
                className={fiatError ? "border-flamingo" : undefined}
              />
              {fiatError && (
                <p id="fiat-amount-error" className="mt-1 text-xs font-bold text-flamingo-dark" role="alert">
                  {fiatError}
                </p>
              )}
            </div>
            <Select aria-label="Foreign currency" value={fiatCurrency} onChange={(e) => setFiatCurrency(e.target.value as SupportedFiatCurrency)}>
              {SUPPORTED_FIAT_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </Select>
          </div>
          <div className="mt-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                aria-label="Manual conversion rate"
                inputMode="decimal"
                autoComplete="off"
                value={rateOverride}
                onChange={(e) => {
                  if (isTypableAmount(e.target.value)) setRateOverride(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (isBlockedDecimalKey(e.key)) e.preventDefault();
                }}
                placeholder={`Rate (${marketRate})`}
                aria-invalid={rateError ? true : undefined}
                aria-describedby={rateError ? "conversion-rate-error" : undefined}
                className={rateError ? "border-flamingo" : undefined}
              />
              {rateError && (
                <p id="conversion-rate-error" className="mt-1 text-xs font-bold text-flamingo-dark" role="alert">
                  {rateError}
                </p>
              )}
            </div>
            <Button type="button" variant="secondary" disabled={!canApply} onClick={() => convertedAmount && setAmount(convertedAmount)}>Apply</Button>
          </div>
          <p className="mt-2 text-xs" aria-live="polite">{convertedAmount ? `${fiatAmount || "0"} ${fiatCurrency} ≈ ${convertedAmount} ${assetKey} (rate ${effectiveRate})` : "Enter an amount to preview the conversion."}</p>
          {rateWarning && <p className="mt-1 text-xs font-bold text-flamingo" role="alert">Manual rate differs from the indicative rate by more than 10%.</p>}
        </div>
        <div>
          <Label htmlFor="expense-amount">Amount</Label>
          <Input
            id="expense-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => {
              if (isTypableAmount(e.target.value)) {
                setAmount(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (isBlockedDecimalKey(e.key)) {
                e.preventDefault();
              }
            }}
            onBlur={() => markTouched("amount")}
            placeholder="0.00"
            aria-invalid={getError("amount") ? true : undefined}
            aria-describedby={getError("amount") ? "expense-amount-error" : undefined}
            className={getError("amount") ? "border-flamingo" : undefined}
          />
          {getError("amount") && (
            <p id="expense-amount-error" className="mt-1 text-xs font-bold text-flamingo-dark" role="alert">
              {getError("amount")}
            </p>
          )}
        </div>

        {/* Optional on-chain reconciliation tag. Validated on blur so the
            user isn't scolded while still typing, but the format is enforced
            before submit — a malformed memo produces a payment the backend
            cannot attribute. */}
        <div>
          <Label htmlFor="expense-memo">Memo (optional)</Label>
          <Input
            id="expense-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => markTouched("memo")}
            placeholder={`${SETTLEMENT_MEMO_PREFIX}dinner-1a2b`}
            aria-describedby="expense-memo-hint"
            aria-invalid={getError("memo") ? true : undefined}
            className={getError("memo") ? "border-flamingo" : undefined}
          />
          {getError("memo") ? (
            <p id="expense-memo-hint" className="mt-1 text-xs font-bold text-flamingo-dark" role="alert">
              {getError("memo")}
            </p>
          ) : (
            <p id="expense-memo-hint" className="mt-1 text-xs text-ink/60">
              Reconciliation tag recorded on-chain. Format: {SETTLEMENT_MEMO_PREFIX} followed by letters,
              numbers, hyphens, or underscores (28 bytes max).
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="expense-asset">Asset</Label>
          <Select
            id="expense-asset"
            value={assetKey}
            onChange={(e) => selectAssetKey(e.target.value)}
            className={getError("assetCode") || getError("assetIssuer") ? "border-flamingo" : undefined}
          >
            {SUPPORTED_ASSET_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
          {(getError("assetCode") || getError("assetIssuer")) && (
            <p className="mt-1 text-xs font-bold text-flamingo-dark">
              {getError("assetCode") ?? getError("assetIssuer")}
            </p>
          )}
        </div>

        <SplitCalculator
          key={calculatorKey}
          totalAmount={amount}
          assetCode={asset.code}
          participants={calculatorParticipants}
          initialMode={splitType}
          initialValues={calculatorInitialValues}
          showAllErrors={showErrors}
          onChange={handleSplitChange}
        />

        {getError("shares") && (
          <p className="text-xs font-bold text-flamingo-dark">{getError("shares")}</p>
        )}

        <ExpenseSplitPreview
          amount={amount}
          assetCode={asset.code}
          splitType={splitType}
          participants={participants.map((id) => {
            const member = members.find((m) => m.userId === id);
            return {
              userId: id,
              displayName: member?.user.displayName ?? id,
              avatarUrl: member?.user.avatarUrl ?? null,
            };
          })}
          shares={sharesPayload}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={submitBlocked} data-testid="add-expense-confirm">
            {isOffline ? "Save offline" : "Add Expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
