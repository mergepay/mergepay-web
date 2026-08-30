"use client";

import { useState, useMemo } from "react";
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardContent } from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input, Label, FieldHint } from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
import { Calculator, Users, DollarSign, AlertCircle } from "lucide-react";

// Zod schema matching src/lib/types.ts and backend split validations
const participantSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  included: z.boolean(),
  customAmount: z.string().optional(),
});

const expenseSimulatorSchema = z.object({
  totalAmount: z.string().refine((val) => {
    const num = Number(val);
    return !isNaN(num) && num > 0;
  }, "Total amount must be greater than 0"),
  splitType: z.enum(["equal", "custom"]),
  participants: z.array(participantSchema).min(1, "At least one participant is required"),
});

export interface SimulatorParticipant {
  id: string;
  name: string;
}

export interface ExpenseSimulatorProps {
  initialParticipants?: SimulatorParticipant[];
  defaultCurrency?: string;
}

export function ExpenseSimulator({
  initialParticipants = [
    { id: "1", name: "Alice (You)" },
    { id: "2", name: "Bob" },
    { id: "3", name: "Charlie" },
  ],
  defaultCurrency = "XLM",
}: ExpenseSimulatorProps) {
  const [totalAmount, setTotalAmount] = useState<string>("100.00");
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");
  const [participants, setParticipants] = useState<
    Array<{ id: string; name: string; included: boolean; customAmount: string }>
  >(
    initialParticipants.map((p) => ({
      ...p,
      included: true,
      customAmount: "0.00",
    }))
  );

  const includedParticipants = useMemo(
    () => participants.filter((p) => p.included),
    [participants]
  );

  // Calculate shares with precise rounding handling (stroop / 7-decimal precision handling)
  const calculatedShares = useMemo(() => {
    const totalNum = Number(totalAmount) || 0;
    const count = includedParticipants.length;

    if (count === 0 || totalNum <= 0) {
      return participants.map((p) => ({ ...p, share: "0.00" }));
    }

    if (splitType === "equal") {
      // Calculate exact share and remainder distribution for rounding edge cases
      const totalStroops = Math.round(totalNum * 10_000_000);
      const baseShareStroops = Math.floor(totalStroops / count);
      const remainderStroops = totalStroops % count;

      let assignedRemainder = 0;
      return participants.map((p) => {
        if (!p.included) return { ...p, share: "0.00" };

        let shareStroops = baseShareStroops;
        if (assignedRemainder < remainderStroops) {
          shareStroops += 1;
          assignedRemainder += 1;
        }

        const shareDecimal = (shareStroops / 10_000_000).toFixed(7).replace(/0+$/, "").replace(/\.$/, "");
        return {
          ...p,
          share: shareDecimal || "0",
        };
      });
    } else {
      // Custom split mode
      return participants.map((p) => {
        if (!p.included) return { ...p, share: "0.00" };
        const customNum = Number(p.customAmount) || 0;
        return {
          ...p,
          share: customNum.toFixed(7).replace(/0+$/, "").replace(/\.$/, ""),
        };
      });
    }
  }, [totalAmount, splitType, participants, includedParticipants.length]);

  // Custom split sum validation
  const customSum = useMemo(() => {
    if (splitType !== "custom") return 0;
    return includedParticipants.reduce((sum, p) => sum + (Number(p.customAmount) || 0), 0);
  }, [splitType, includedParticipants]);

  const totalNum = Number(totalAmount) || 0;
  const customDifference = Number((customSum - totalNum).toFixed(7));
  const isCustomValid = Math.abs(customDifference) < 0.0000005;

  // Zod validation check for rendering warnings/errors
  const validationResult = useMemo(() => {
    return expenseSimulatorSchema.safeParse({
      totalAmount,
      splitType,
      participants,
    });
  }, [totalAmount, splitType, participants]);

  function toggleParticipant(id: string) {
    setParticipants((prev)
      => prev.map((p) => (p.id === id ? { ...p, included: !p.included } : p))
    );
  }

  function updateCustomAmount(id: string, amount: string) {
    setParticipants((prev)
      => prev.map((p) => (p.id === id ? { ...p, customAmount: amount } : p))
    );
  }

  return (
    <Card className="w-full max-w-xl mx-auto">
      <CardHeader className="border-b-3 border-ink bg-butter flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          <CardTitle>Expense Split Simulator</CardTitle>
        </div>
        <Badge tone="lime">Interactive</Badge>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        {/* Total Amount & Currency */}
        <div>
          <Label htmlFor="simulator-total-amount">Total Expense Amount ({defaultCurrency})</Label>
          <div className="relative mt-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink/50">
              <DollarSign className="h-4 w-4" />
            </div>
            <Input
              id="simulator-total-amount"
              type="number"
              step="0.0000001"
              min="0"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="pl-9 font-mono font-bold text-lg"
              placeholder="0.00"
              aria-label="Total expense amount"
            />
          </div>
          <FieldHint>Stellar amounts support up to 7 decimal places for precise micro-splits.</FieldHint>
        </div>

        {/* Split Type Selector */}
        <div>
          <Label>Split Method</Label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              type="button"
              onClick={() => setSplitType("equal")}
              className={`flex items-center justify-center gap-2 rounded-xl border-3 border-ink p-3 font-display text-sm uppercase tracking-wide transition-all shadow-brutal-sm ${
                splitType === "equal" ? "bg-grape text-white" : "bg-cream hover:bg-paper"
              }`}
              aria-pressed={splitType === "equal"}
            >
              <Users className="h-4 w-4" /> Equal Split
            </button>
            <button
              type="button"
              onClick={() => setSplitType("custom")}
              className={`flex items-center justify-center gap-2 rounded-xl border-3 border-ink p-3 font-display text-sm uppercase tracking-wide transition-all shadow-brutal-sm ${
                splitType === "custom" ? "bg-grape text-white" : "bg-cream hover:bg-paper"
              }`}
              aria-pressed={splitType === "custom"}
            >
              <DollarSign className="h-4 w-4" /> Custom Split
            </button>
          </div>
        </div>

        {/* Participants & Shares Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Participants ({includedParticipants.length} included)</Label>
            <span className="text-xs font-mono text-ink/60">Target: {totalAmount || "0"} {defaultCurrency}</span>
          </div>

          <div className="space-y-2" role="region" aria-label="Participants split list">
            {calculatedShares.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 rounded-xl border-2 border-ink p-3 transition-colors ${
                  p.included ? "bg-white shadow-brutal-sm" : "bg-cream/40 opacity-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`participant-checkbox-${p.id}`}
                    checked={p.included}
                    onChange={() => toggleParticipant(p.id)}
                    className="h-5 w-5 rounded border-2 border-ink accent-grape cursor-pointer"
                    aria-label={`Include ${p.name} in split`}
                  />
                  <label
                    htmlFor={`participant-checkbox-${p.id}`}
                    className="font-bold text-sm cursor-pointer select-none"
                  >
                    {p.name}
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  {splitType === "custom" ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.0000001"
                        min="0"
                        value={p.customAmount}
                        disabled={!p.included}
                        onChange={(e) => updateCustomAmount(p.id, e.target.value)}
                        className="w-28 font-mono text-right text-sm py-1 h-9"
                        aria-label={`Custom amount for ${p.name}`}
                      />
                      <span className="text-xs font-mono text-ink/60">{defaultCurrency}</span>
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className="font-mono font-bold text-base text-grape">
                        {p.share} {defaultCurrency}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Validation & Rounding Notifications */}
        {splitType === "custom" && !isCustomValid && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-ink bg-flamingo p-3 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold uppercase">Custom amounts do not match total</p>
              <p>
                Sum of shares: <span className="font-mono font-bold">{customSum.toFixed(7)}</span> / Target: <span className="font-mono font-bold">{totalNum.toFixed(7)}</span>
                {customDifference > 0 ? ` (Over by ${customDifference})` : ` (Under by ${Math.abs(customDifference)})`}
              </p>
            </div>
          </div>
        )}

        {splitType === "equal" && includedParticipants.length > 0 && (
          <div className="rounded-xl border-2 border-ink bg-cream p-3 text-xs space-y-1">
            <p className="font-bold uppercase text-ink/70">Rounding Note</p>
            <p className="text-ink/60">
              Dividing {totalAmount} {defaultCurrency} equally among {includedParticipants.length} participant(s) leaves a remainder resolved automatically to the 7th decimal place (stroops).
            </p>
          </div>
        )}

        {!validationResult.success && (
          <div className="text-xs text-flamingo font-bold">
            Please resolve input errors before saving expense.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
