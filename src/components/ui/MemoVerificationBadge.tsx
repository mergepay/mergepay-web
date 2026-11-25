"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import {
  CONFIGURED_NETWORK,
  explorerTxUrl,
  shortHash,
  type StellarNetwork,
} from "./memoVerificationUtils";

export interface MemoVerificationBadgeProps {
  memo: string | null | undefined;
  txHash?: string | null;
  network?: StellarNetwork;
}

export function MemoVerificationBadge({
  memo,
  txHash,
  network = CONFIGURED_NETWORK,
}: MemoVerificationBadgeProps) {
  const { valid, error, byteLength, shortCode, txUrl } = explorerTxUrl(memo, txHash, network);

  return (
    <div
      data-testid="memo-verification-badge"
      className="inline-flex flex-wrap items-center gap-2 rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-xs font-mono text-ink shadow-brutal-sm"
    >
      {valid ? (
        <span className="inline-flex items-center gap-1 font-bold">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{memo?.trim() || "No memo"}</span>
          {shortCode && <span className="text-ink/60">({byteLength}/28B)</span>}
        </span>
      ) : (
        <span role="alert" className="inline-flex items-center gap-1 font-bold text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error ?? "Invalid settlement memo"}</span>
        </span>
      )}

      {txUrl && txHash && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline font-sans font-semibold"
        >
          <span>{shortHash(txHash)}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
