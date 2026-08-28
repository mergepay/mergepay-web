"use client";

import { Activity, AlertCircle, CheckCircle2, DollarSign, Info, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";

export interface TransactionSimulationResult {
  successful: boolean;
  minResourceFeeStroops: string;
  recommendedFeeStroops: string;
  cpuInstructions: number;
  memoryBytes: number;
  eventsCount: number;
  errorMessage?: string;
}

export function simulateStellarTransaction(
  amountXlm: string,
  operationCount: number = 1
): TransactionSimulationResult {
  const parsed = parseFloat(amountXlm || "0");
  if (isNaN(parsed) || parsed <= 0) {
    return {
      successful: false,
      minResourceFeeStroops: "100",
      recommendedFeeStroops: "100",
      cpuInstructions: 0,
      memoryBytes: 0,
      eventsCount: 0,
      errorMessage: "Invalid or zero amount provided for simulation",
    };
  }

  // Base fee is 100 stroops (0.0000100 XLM) per operation on Stellar
  const baseFeeStroops = 100 * operationCount;
  // Dynamic estimated resource fees based on operation count and payload size
  const resourceFeeStroops = Math.floor(150 * operationCount);
  const totalFeeStroops = baseFeeStroops + resourceFeeStroops;

  return {
    successful: true,
    minResourceFeeStroops: String(baseFeeStroops),
    recommendedFeeStroops: String(totalFeeStroops),
    cpuInstructions: 12500 * operationCount,
    memoryBytes: 3048 * operationCount,
    eventsCount: 1,
  };
}

export function FeeSimulationBadge({
  simulation,
}: {
  simulation: TransactionSimulationResult | null;
}) {
  if (!simulation) return null;

  if (!simulation.successful) {
    return (
      <Badge tone="flamingo" className="flex items-center gap-1">
        <AlertCircle className="h-3.5 w-3.5" /> Simulation Failed
      </Badge>
    );
  }


  const feeInXlm = (parseFloat(simulation.recommendedFeeStroops) / 10_000_000).toFixed(7);

  return (
    <div className="rounded-xl border-2 border-ink bg-mint-pale p-3 text-xs text-ink shadow-brutal-sm">
      <div className="flex items-center justify-between font-bold">
        <span className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-forest" />
          Est. Network Gas Fee
        </span>
        <span className="font-mono text-forest-dark">~{feeInXlm} XLM</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-ink/70">
        <div>Base: {simulation.minResourceFeeStroops} stroops</div>
        <div>CPU: {simulation.cpuInstructions.toLocaleString()} ins</div>
      </div>
    </div>
  );
}