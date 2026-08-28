"use client";

import { Activity, AlertTriangle, Clock, Layers, Zap } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { SupportedFiatCurrency } from "@/lib/currency";
import {
  estimateFiatFee,
  estimateStellarFee,
  ledgerInclusionLabel,
} from "@/lib/feeEstimation";

/**
 * Gas / fee estimator widget for Stellar transactions (#247).
 *
 * Shows the projected network fee (base fee × operation count) for the
 * transaction the user is about to sign, its approximate fiat value, an
 * operation breakdown, and a rough ledger-inclusion time. If a live network
 * fee query fails, the widget degrades gracefully to the deterministic base
 * estimate and says so, rather than blocking the user from proceeding.
 *
 * Fees are estimates for display only — the network charges the fee the
 * transaction actually carries, and Freighter shows the exact amount at
 * signing time.
 */
export function FeeEstimatorWidget({
  operationCount = 1,
  currency = "USD",
  amount,
  assetCode,
  feeError,
}: {
  /** Number of operations the transaction will carry. */
  operationCount?: number;
  /** Fiat currency for the value estimate. */
  currency?: SupportedFiatCurrency;
  /** Payment amount — shown only as context, not used in the fee math. */
  amount?: string;
  /** Asset code for the payment amount, e.g. "XLM". */
  assetCode?: string;
  /** Set when a live fee query failed; the widget then shows the fallback. */
  feeError?: string | null;
}) {
  const estimate = estimateStellarFee(operationCount);
  const fiat = estimateFiatFee(estimate.feeXlm, { currency });

  const breakdown = [
    {
      icon: <Layers className="h-3.5 w-3.5" />,
      label: "Operations",
      value: `${estimate.operationCount}`,
    },
    {
      icon: <Zap className="h-3.5 w-3.5" />,
      label: "Base fee",
      value: `${estimate.baseFeeStroops.toString()} stroops`,
    },
    {
      icon: <Activity className="h-3.5 w-3.5" />,
      label: "Resource fee",
      value:
        estimate.resourceFeeStroops > 0n
          ? `${estimate.resourceFeeStroops.toString()} stroops`
          : "—",
    },
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: "Ledger inclusion",
      value: ledgerInclusionLabel(estimate.ledgerEstimateSeconds),
    },
  ];

  return (
    <div className="rounded-xl border-3 border-ink bg-aqua-pale p-3 text-xs text-ink shadow-brutal-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-display text-[11px] uppercase tracking-widest">
          <Zap className="h-4 w-4 text-ink" />
          Est. network fee
        </span>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-bold tabular-nums">
            {formatMoney(estimate.feeXlm, "XLM")}
          </span>
          {fiat !== null && (
            <span className="text-[11px] text-ink/60">
              ≈ {fiat.toLocaleString("en-US", { style: "currency", currency })}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink/70 sm:grid-cols-4">
        {breakdown.map((row) => (
          <div key={row.label} className="flex items-center gap-1.5">
            {row.icon}
            <span className="truncate">
              <span className="text-ink/50">{row.label}:</span>{" "}
              <span className="font-mono font-bold text-ink">{row.value}</span>
            </span>
          </div>
        ))}
      </div>

      {feeError ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded-lg border-2 border-ink bg-butter-pale px-2 py-1.5 text-[11px] font-bold"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Couldn&apos;t fetch live network fees ({feeError}) — showing the
            base estimate. Freighter confirms the exact fee when you sign.
          </span>
        </p>
      ) : (
        amount !== undefined && (
          <p className="mt-1.5 text-[11px] text-ink/50">
            Fee for sending {formatMoney(amount, assetCode)} — paid from your
            XLM balance at signing.
          </p>
        )
      )}
    </div>
  );
}
