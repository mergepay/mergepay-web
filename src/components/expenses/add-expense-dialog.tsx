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
} from "@/lib/expenseValidation";
import { expenseFormSchema } from "@/lib/validations/expense";
import { MAX_DECIMAL_PLACES, parseExactAmount } from "@/lib/money";
import { useWalletDisconnected } from "@/lib/wallet-store";
import { convertCurrency, currencyRate, rateDeviationPercent, SUPPORTED_FIAT_CURRENCIES, type SupportedFiatCurrency } from "@/lib/currency";
import { useLocalStorageDraft } from "@/lib/useLocalStorageDraft";
import { parseExpenseDeepLink } from "@/lib/deepLink";
import { useOfflineStore } from "@/lib/store/offlineStore";
import { useAssetStore, isActiveAsset, type ActiveAsset } from "@/lib/asset-store";

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
  const [participants, setParticipants] = useState<string[]>(members.map((m) => m.userId));
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
  const walletDisconnected = useWalletDisconnected();
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  const submitBlocked = isOffline || walletDisconnected;

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
  const effectiveRate = rateOverride.trim() ? Number(rateOverride) : marketRate;
  const convertedAmount = convertCurrency(fiatAmount, fiatCurrency, effectiveRate);
  const rateWarning = rateOverride.trim() && rateDeviationPercent(effectiveRate, marketRate) > 10;

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

    try {
      setSubmitting(true);
      await create.mutateAsync({
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
          <Label htmlFor="expense-amount">Amount</Label>
          <Input
            id="expense-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || /^\d*\.?\d{0,7}$/.test(val)) {
                setAmount(val);
              }
            }}
            onKeyDown={(e) => {
              if (["e", "E", "+", "-"].includes(e.key)) {
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
          <Button type="submit" loading={pending} disabled={submitBlocked}>
            Add Expense
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
