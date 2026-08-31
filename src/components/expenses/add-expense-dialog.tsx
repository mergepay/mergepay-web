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
} from "@/lib/expenseValidation";
import { expenseFormSchema } from "@/lib/validations/expense";
import { MAX_DECIMAL_PLACES, parseExactAmount } from "@/lib/money";
import { useWalletDisconnected } from "@/lib/wallet-store";
import { convertCurrency, currencyRate, rateDeviationPercent, SUPPORTED_FIAT_CURRENCIES, type SupportedFiatCurrency } from "@/lib/currency";
import { useLocalStorageDraft } from "@/lib/useLocalStorageDraft";
import { parseExpenseDeepLink } from "@/lib/deepLink";
import { useOfflineStore } from "@/lib/store/offlineStore";

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

  const asset = useMemo(
    () => SETTLEMENT_ASSETS.find((a) => a.code === assetKey) ?? SETTLEMENT_ASSETS[0],
    [assetKey]
  );

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

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
      toast.success("Expense added successfully");
      onClose();
    } catch (err) {
      const msg = handleApiError(err, "Could not create expense");
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
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

        <div>
          <Label htmlFor="expense-amount">Amount</Label>
          <Input
            id="expense-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => markTouched("amount")}
            placeholder="0.00"
            className={getError("amount") ? "border-flamingo" : undefined}
          />
          {getError("amount") && (
            <p className="mt-1 text-xs font-bold text-flamingo-dark">{getError("amount")}</p>
          )}
        </div>

        <div>
          <Label htmlFor="expense-asset">Asset</Label>
          <Select
            id="expense-asset"
            value={assetKey}
            onChange={(e) => setAssetKey(e.target.value)}
          >
            {SUPPORTED_ASSET_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="expense-split-type">Split Type</Label>
          <Select
            id="expense-split-type"
            value={splitType}
            onChange={(e) => setSplitType(e.target.value as SplitType)}
          >
            <option value="equal">Equal</option>
            <option value="custom">Custom Amount</option>
            <option value="percentage">Percentage</option>
          </Select>
        </div>

        {getError("shares") && (
          <p className="text-xs font-bold text-flamingo-dark">{getError("shares")}</p>
        )}

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
