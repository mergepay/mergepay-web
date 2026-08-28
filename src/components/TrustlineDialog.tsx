"use client";

import { TrustlineModal, type TrustlineModalProps } from "@/components/ui/TrustlineModal";
import type { TrustlineCheckResult } from "@/lib/types";

export type { TrustlineCheckResult };

export function isAssetNative(assetCode: string): boolean {
  return assetCode.toUpperCase() === "XLM" || assetCode.toUpperCase() === "NATIVE";
}

export function checkAccountHasTrustline(
  balances: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string }>,
  assetCode: string,
  assetIssuer?: string | null
): boolean {
  if (isAssetNative(assetCode)) return true;
  if (!assetIssuer) return true;

  return balances.some(
    (b) =>
      b.asset_code?.toUpperCase() === assetCode.toUpperCase() &&
      b.asset_issuer?.toUpperCase() === assetIssuer.toUpperCase()
  );
}

export interface TrustlineDialogProps {
  open: boolean;
  onClose: () => void;
  assetCode: string;
  assetIssuer: string;
  accountPublicKey?: string;
  onSuccess?: () => void;
}

export function TrustlineDialog(props: TrustlineDialogProps) {
  return <TrustlineModal {...props} />;
}