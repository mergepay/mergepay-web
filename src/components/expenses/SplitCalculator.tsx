"use client";

/**
 * SplitCalculator (#353)
 *
 * Lets the person adding an expense choose how it is divided — equally, by
 * exact amounts, or by percentage — and shows, as they type, whether the
 * allocations add up to the expense total (or to 100%).
 *
 * Form state lives in React Hook Form, validated by `splitCalculatorSchema`
 * (zod). The arithmetic is delegated to `calculateSplit` in `src/lib/split.ts`,
 * which works in stroops and basis points, so the balance check can never be
 * thrown off by floating-point rounding. The component renders no `<form>` of
 * its own so it can sit inside a parent form (e.g. `AddExpenseDialog`).
 */

import { useEffect, useMemo, useRef } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Divide, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  calculateSplit,
  evenSplitValues,
  formatBasisPoints,
  fromStroops,
  trimAmount,
  type SplitCalculation,
  type SplitMode,
  type SplitRowInput,
} from "@/lib/split";
import {
  describeSplitImbalance,
  splitCalculatorSchema,
  type SplitCalculatorValues,
} from "@/lib/validations/expense";
import type { ExpenseShareInput } from "@/lib/types";

export interface SplitCalculatorParticipant {
  userId: string;
  displayName: string;
}

export interface SplitCalculatorChange {
  mode: SplitMode;
  /** Shares in the `CreateExpenseRequest` shape for the active mode. */
  shares: ExpenseShareInput[];
  /** True when the schema passes and the split balances exactly. */
  valid: boolean;
  calculation: SplitCalculation;
}

export interface SplitCalculatorProps {
  /** Expense total as typed in the parent form. */
  totalAmount: string;
  assetCode: string;
  participants: SplitCalculatorParticipant[];
  initialMode?: SplitMode;
  /** Pre-filled values per participant, e.g. from a restored draft. */
  initialValues?: Record<string, { amount?: string; percent?: string }>;
  /** Show every row error, not only those on fields the user has touched. */
  showAllErrors?: boolean;
  onChange?: (change: SplitCalculatorChange) => void;
  className?: string;
}

const MODES: { id: SplitMode; label: string }[] = [
  { id: "equal", label: "Equal" },
  { id: "custom", label: "Exact amounts" },
  { id: "percentage", label: "Percentage" },
];

function toAllocations(
  participants: SplitCalculatorParticipant[],
  existing: Record<string, { amount?: string; percent?: string }> = {}
): SplitCalculatorValues["allocations"] {
  return participants.map((p) => ({
    userId: p.userId,
    amount: existing[p.userId]?.amount ?? "",
    percent: existing[p.userId]?.percent ?? "",
  }));
}

function toShares(mode: SplitMode, calc: SplitCalculation, rows: SplitRowInput[]): ExpenseShareInput[] {
  if (mode === "equal") return rows.map((r) => ({ userId: r.userId }));
  if (mode === "custom") {
    return rows.map((r, i) => ({
      userId: r.userId,
      amount: calc.rows[i]?.amount ? trimAmount(calc.rows[i].amount as string) : (r.amount ?? "").trim(),
    }));
  }
  return rows.map((r, i) => ({
    userId: r.userId,
    percent: (calc.rows[i]?.basisPoints ?? 0) / 100,
  }));
}

export function SplitCalculator({
  totalAmount,
  assetCode,
  participants,
  initialMode = "equal",
  initialValues,
  showAllErrors = false,
  onChange,
  className,
}: SplitCalculatorProps) {
  const { control, register, setValue, getValues, trigger, formState } = useForm<SplitCalculatorValues>({
    resolver: zodResolver(splitCalculatorSchema),
    mode: "onChange",
    defaultValues: {
      totalAmount,
      mode: initialMode,
      allocations: toAllocations(participants, initialValues),
    },
  });
  const { fields, replace } = useFieldArray({ control, name: "allocations", keyName: "key" });

  const mode = useWatch({ control, name: "mode" }) as SplitMode;
  const allocations = useWatch({ control, name: "allocations" });

  // Keep the rows in step with the participant list, preserving what was typed.
  const participantKey = participants.map((p) => p.userId).join("|");
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const current = Object.fromEntries(getValues("allocations").map((a) => [a.userId, a]));
    replace(toAllocations(participants, current));
    // Only the id list matters; `participants` itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantKey]);

  // The total comes from the parent form; mirror it so the resolver sees it.
  useEffect(() => {
    setValue("totalAmount", totalAmount, { shouldValidate: formState.isSubmitted || formState.isDirty });
  }, [totalAmount, setValue, formState.isSubmitted, formState.isDirty]);

  const rows: SplitRowInput[] = useMemo(
    () => (allocations ?? []).map((a) => ({ userId: a.userId, amount: a.amount, percent: a.percent })),
    [allocations]
  );
  const calc = useMemo(() => calculateSplit(mode, totalAmount, rows), [mode, totalAmount, rows]);
  const imbalance = describeSplitImbalance(calc);

  // Report upward whenever the effective split changes.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const signature = JSON.stringify({ mode, totalAmount, rows });
  useEffect(() => {
    const valid =
      calc.balance === "balanced" &&
      splitCalculatorSchema.safeParse({ totalAmount, mode, allocations: rows.map((r) => ({ userId: r.userId, amount: r.amount ?? "", percent: r.percent ?? "" })) }).success;
    onChangeRef.current?.({ mode, shares: toShares(mode, calc, rows), valid, calculation: calc });
    // `signature` captures every input `calc` is derived from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  function selectMode(next: SplitMode) {
    setValue("mode", next, { shouldDirty: true });
    void trigger();
  }

  function fillEvenly() {
    const even = evenSplitValues(mode, totalAmount, rows.map((r) => r.userId));
    even.forEach((row, i) => {
      if (mode === "custom") setValue(`allocations.${i}.amount`, row.amount ?? "", { shouldDirty: true, shouldTouch: true });
      if (mode === "percentage") setValue(`allocations.${i}.percent`, row.percent ?? "", { shouldDirty: true, shouldTouch: true });
    });
    void trigger();
  }

  function rowError(index: number): string | undefined {
    const field = mode === "custom" ? "amount" : "percent";
    const touched = formState.touchedFields.allocations?.[index]?.[field];
    const dirty = formState.dirtyFields.allocations?.[index]?.[field];
    if (!showAllErrors && !touched && !dirty) return undefined;
    return formState.errors.allocations?.[index]?.[field]?.message;
  }

  const totalKnown = calc.totalStroops !== null && calc.totalStroops > 0n;

  return (
    <section
      aria-label="Split calculator"
      className={cn("space-y-4 rounded-2xl border-3 border-ink bg-paper p-4 shadow-brutal", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label id="split-mode-label" className="mb-0">
          Split
        </Label>
        {mode !== "equal" && participants.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={fillEvenly} disabled={mode === "custom" && !totalKnown}>
            <Divide className="h-3.5 w-3.5" aria-hidden="true" /> Split evenly
          </Button>
        )}
      </div>

      <div role="radiogroup" aria-labelledby="split-mode-label" className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => selectMode(m.id)}
            className={cn(
              "rounded-xl border-2 border-ink px-2 py-2 font-display text-[11px] uppercase tracking-wide transition-all duration-100 sm:text-xs",
              mode === m.id
                ? "bg-ink text-lime shadow-brutal-sm"
                : "bg-cream text-ink hover:-translate-x-px hover:-translate-y-px hover:shadow-brutal-sm"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {fields.length === 0 ? (
        <p className="rounded-xl border-2 border-ink bg-butter-pale p-3 text-sm font-bold" role="alert">
          Select at least one participant to split this expense.
        </p>
      ) : (
        <ul className="space-y-2">
          {fields.map((field, i) => {
            const participant = participants.find((p) => p.userId === field.userId);
            const name = participant?.displayName ?? field.userId;
            const row = calc.rows[i];
            const error = rowError(i);
            const inputId = `split-${mode}-${field.userId}`;
            return (
              <li
                key={field.key}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border-2 border-ink bg-cream p-3",
                  mode !== "equal" && "sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
                )}
              >
                <label htmlFor={mode === "equal" ? undefined : inputId} className="min-w-0 truncate text-sm font-bold">
                  {name}
                </label>

                {mode !== "equal" && (
                  <div className="relative col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                    <Input
                      id={inputId}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={mode === "custom" ? "0.00" : "0"}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${inputId}-error` : undefined}
                      onKeyDown={(e) => {
                        if (["e", "E", "+", "-"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      className={cn("py-2 pr-14 text-right font-mono", error && "border-flamingo")}
                      {...register(mode === "custom" ? `allocations.${i}.amount` : `allocations.${i}.percent`, {
                        onChange: (e) => {
                          const val = e.target.value;
                          if (mode === "custom") {
                            if (val !== "" && !/^\d*\.?\d{0,7}$/.test(val)) {
                              return;
                            }
                          } else {
                            if (val !== "" && !/^\d*\.?\d{0,2}$/.test(val)) {
                              return;
                            }
                          }
                        },
                      })}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-display text-[10px] uppercase tracking-widest text-ink/60">
                      {mode === "custom" ? assetCode : "%"}
                    </span>
                  </div>
                )}

                <span className="text-right font-mono text-xs text-ink/70" data-testid={`split-share-${field.userId}`}>
                  {mode === "custom"
                    ? row?.basisPoints != null
                      ? `${formatBasisPoints(row.basisPoints)}%`
                      : "—"
                    : row?.amount != null && totalKnown
                      ? `${trimAmount(row.amount)} ${assetCode}`
                      : "—"}
                </span>

                {error && (
                  <p id={`${inputId}-error`} className="col-span-full text-xs font-bold text-flamingo" role="alert">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <SplitStatus calc={calc} imbalance={imbalance} assetCode={assetCode} />
    </section>
  );
}

function SplitStatus({
  calc,
  imbalance,
  assetCode,
}: {
  calc: SplitCalculation;
  imbalance: string | null;
  assetCode: string;
}) {
  const base = "flex items-start gap-2 rounded-xl border-2 border-ink p-3 text-sm";

  if (calc.balance === "balanced") {
    return (
      <div className={cn(base, "bg-lime-pale")} role="status" aria-live="polite" data-testid="split-status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="font-bold">
          {calc.mode === "percentage"
            ? "Percentages add up to 100%."
            : `Shares add up to ${trimAmount(fromStroops(calc.totalStroops ?? 0n))} ${assetCode}.`}
        </p>
      </div>
    );
  }

  if (imbalance) {
    return (
      <div className={cn(base, "bg-flamingo-pale shadow-brutal-sm")} role="alert" aria-live="assertive" data-testid="split-status">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="font-bold">{imbalance}</p>
      </div>
    );
  }

  const totalMissing = calc.totalStroops === null || calc.totalStroops <= 0n;
  return (
    <div className={cn(base, "bg-butter-pale")} role="status" aria-live="polite" data-testid="split-status">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        {totalMissing
          ? "Enter the expense amount to see each share."
          : calc.rows.length === 0
            ? "Select at least one participant."
            : `Fill in a valid ${calc.mode === "custom" ? "amount" : "percentage"} for every participant.`}
      </p>
    </div>
  );
}
