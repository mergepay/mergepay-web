import { SETTLEMENT_ASSETS } from "./constants";

const STELLAR_MAX_DECIMALS = 7;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateStellarAmount(amount: string): ValidationResult {
  if (!amount || amount.trim() === "") {
    return { valid: false, error: "Amount is required" };
  }

  const cleaned = amount.trim();

  if (cleaned === "") {
    return { valid: false, error: "Amount is required" };
  }

  if (!/^\d+(\.\d*)?$/.test(cleaned)) {
    return { valid: false, error: "Amount must be a positive number" };
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    return { valid: false, error: "Amount must be a valid number" };
  }

  if (num <= 0) {
    return { valid: false, error: "Amount must be greater than zero" };
  }

  const dotIndex = cleaned.indexOf(".");
  if (dotIndex !== -1) {
    const decimals = cleaned.slice(dotIndex + 1).length;
    if (decimals > STELLAR_MAX_DECIMALS) {
      return {
        valid: false,
        error: `Amount must have at most ${STELLAR_MAX_DECIMALS} decimal places`,
      };
    }
  }

  return { valid: true };
}

export function validateSettlementAsset(
  assetCode: string,
  assetIssuer: string | null
): ValidationResult {
  const supported = SETTLEMENT_ASSETS.some(
    (a) => a.code === assetCode && a.issuer === assetIssuer
  );
  if (!supported) {
    return {
      valid: false,
      error: `Asset ${assetCode} is not supported for settlement`,
    };
  }
  return { valid: true };
}

export function validateSettlementInput(params: {
  amount: string;
  assetCode: string;
  assetIssuer?: string | null;
}): ValidationResult {
  const amountResult = validateStellarAmount(params.amount);
  if (!amountResult.valid) return amountResult;

  const assetResult = validateSettlementAsset(
    params.assetCode,
    params.assetIssuer ?? null
  );
  if (!assetResult.valid) return assetResult;

  return { valid: true };
}
