"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Pencil, Save, Trash2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  budgetTone,
  crossedBudgetThresholds,
  groupBudgetPercent,
  spentInBudgetCurrency,
  type BudgetExpense,
} from "@/lib/budgets";
import {
  SUPPORTED_FIAT_CURRENCIES,
  type SupportedFiatCurrency,
} from "@/lib/currency";
import { useGroupBudgetStore } from "@/lib/group-budget-store";

function percentLabel(percent: number): string {
  return `${Math.round(percent)}%`;
}

/**
 * Group budget progress bar + spending limit alerts (#248).
 *
 * Tracks the group's cumulative spending against an admin-configured budget
 * and warns via sonner when 80% and 100% of the budget are consumed. The
 * progress bar is a bold neobrutalist bar color-coded by how much of the
 * budget is used (green < 80%, yellow 80–99%, red ≥ 100%).
 *
 * Budgets are configured by admins and persisted locally; see
 * `src/lib/group-budget-store.ts` for the storage note.
 */
export function GroupBudgetTracker({
  groupId,
  expenses,
  assetCode,
  isAdmin,
  className,
}: {
  groupId: string;
  expenses: BudgetExpense[];
  /** Asset the group's spending is denominated in (for the conversion). */
  assetCode?: string | null;
  isAdmin: boolean;
  className?: string;
}) {
  const config = useGroupBudgetStore((s) => s.budgets[groupId]);
  const setBudget = useGroupBudgetStore((s) => s.setBudget);
  const clearBudget = useGroupBudgetStore((s) => s.clearBudget);
  const markWarned = useGroupBudgetStore((s) => s.markWarned);

  const [editing, setEditing] = useState(false);
  const [draftLimit, setDraftLimit] = useState("");
  const [draftCurrency, setDraftCurrency] =
    useState<SupportedFiatCurrency>("USD");

  const percent = useMemo(() => {
    if (!config) return 0;
    return groupBudgetPercent({
      expenses,
      assetCode,
      limit: config.limit,
      currency: config.currency,
    });
  }, [config, expenses, assetCode]);

  const spent = useMemo(() => {
    if (!config) return null;
    return spentInBudgetCurrency({ expenses, assetCode, currency: config.currency });
  }, [config, expenses, assetCode]);

  // Fire the 80% / 100% warnings only when a threshold is crossed during a
  // session — never on first paint for a group already over budget.
  const prevPercent = useRef<number | null>(null);
  useEffect(() => {
    if (prevPercent.current === null) {
      prevPercent.current = percent;
      return;
    }
    const crossed = crossedBudgetThresholds(prevPercent.current, percent);
    prevPercent.current = percent;
    if (!config) return;
    for (const threshold of crossed) {
      if (config.warned.includes(threshold)) continue;
      if (threshold === "100") {
        toast.warning(
          `The group budget is exhausted (${percentLabel(percent)})`
        );
      } else {
        toast.warning(
          `Group budget ${percentLabel(percent)} used — over 80% now`
        );
      }
      markWarned(groupId, threshold);
    }
  }, [percent, config, groupId, markWarned]);

  if (!config) {
    // Only admins can configure a budget; members see nothing until one is set.
    if (!isAdmin) return null;
    return (
      <section
        aria-labelledby="group-budget-title"
        className={cn(
          "rounded-2xl border-3 border-ink bg-butter p-4 shadow-brutal",
          className
        )}
      >
        <h2
          id="group-budget-title"
          className="flex items-center gap-2 font-display text-sm uppercase tracking-widest"
        >
          <WalletCards className="h-4 w-4" /> Set a group budget
        </h2>
        <p className="mt-1 text-xs text-ink/80">
          Add a spending cap for this group. Members will see a progress bar
          and get warned as spending approaches the limit.
        </p>
        <BudgetForm
          initialCurrency={draftCurrency}
          submitLabel="Save budget"
          onSubmit={(limit, currency) => {
            setBudget(groupId, limit, currency);
            toast.success(`Group budget set to ${limit} ${currency}`);
          }}
        />
      </section>
    );
  }

  const tone = budgetTone(percent);
  const exhausted = percent >= 100;

  return (
    <section
      aria-labelledby="group-budget-title"
      className={cn(
        "rounded-2xl border-3 border-ink bg-cream p-4 shadow-brutal",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="group-budget-title"
          className="flex items-center gap-2 font-display text-sm uppercase tracking-widest"
        >
          <WalletCards className="h-4 w-4" /> Group budget
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-lg border-2 border-ink px-2 py-0.5 font-display text-[10px] uppercase tracking-widest shadow-brutal-sm",
              tone === "flamingo" && "bg-flamingo text-ink",
              tone === "butter" && "bg-butter text-ink",
              tone === "lime" && "bg-lime text-ink"
            )}
          >
            {percentLabel(percent)} used
          </span>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraftLimit(String(config.limit));
                setDraftCurrency(config.currency);
                setEditing((v) => !v);
              }}
              aria-expanded={editing}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editing ? "Close" : "Edit"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-mono font-bold tabular-nums">
          {spent === null
            ? "0"
            : spent.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
          {config.currency}
        </span>
        <span className="text-xs text-ink/60">
          of {config.limit.toLocaleString()} {config.currency} limit
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Group budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(percent))}
        className="mt-2 h-6 w-full overflow-hidden rounded-lg border-3 border-ink bg-paper"
      >
        <div
          className={cn(
            "h-full transition-[width]",
            tone === "flamingo" && "bg-flamingo",
            tone === "butter" && "bg-butter",
            tone === "lime" && "bg-lime"
          )}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>

      {exhausted && (
        <p
          role="alert"
          className="mt-2 rounded-xl border-2 border-ink bg-flamingo px-3 py-2 text-xs font-bold"
        >
          This group has spent its full budget. Consider raising the limit.
        </p>
      )}

      {isAdmin && editing && (
        <BudgetForm
          initialLimit={String(config.limit)}
          initialCurrency={config.currency}
          submitLabel="Update budget"
          onSubmit={(limit, currency) => {
            setBudget(groupId, limit, currency);
            setEditing(false);
            toast.success(`Group budget updated to ${limit} ${currency}`);
          }}
          onClear={() => {
            clearBudget(groupId);
            setEditing(false);
            toast.success("Group budget removed");
          }}
        />
      )}
    </section>
  );
}

function BudgetForm({
  initialLimit = "",
  initialCurrency = "USD",
  submitLabel,
  onSubmit,
  onClear,
}: {
  initialLimit?: string;
  initialCurrency?: SupportedFiatCurrency;
  submitLabel: string;
  onSubmit: (limit: number, currency: SupportedFiatCurrency) => void;
  onClear?: () => void;
}) {
  const [limit, setLimit] = useState(initialLimit);
  const [currency, setCurrency] =
    useState<SupportedFiatCurrency>(initialCurrency);
  const parsed = Number(limit);

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number.isFinite(parsed) || parsed <= 0) {
          toast.error("Enter a budget greater than zero");
          return;
        }
        onSubmit(parsed, currency);
      }}
    >
      <div className="min-w-0 flex-1">
        <Label htmlFor="budget-limit">Limit</Label>
        <Input
          id="budget-limit"
          type="number"
          min="0"
          step="any"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="500"
        />
      </div>
      <div>
        <Label htmlFor="budget-currency">Currency</Label>
        <Select
          id="budget-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as SupportedFiatCurrency)}
        >
          {SUPPORTED_FIAT_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="sm">
        <Save className="h-3.5 w-3.5" /> {submitLabel}
      </Button>
      {onClear && (
        <Button type="button" size="sm" variant="danger" onClick={onClear}>
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      )}
    </form>
  );
}
