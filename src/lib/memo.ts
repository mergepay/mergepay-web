/**
 * Memo verification helper functions and re-exports for Mergepay payments.
 * Enforces Stellar ledger constraints and the Mergepay `MP:<code>` convention.
 *
 * @module lib/memo
 */

import {
  validateMemo,
  validateShortCode,
  buildSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  generateShortCode,
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
  type MemoValidationResult,
  type MemoBreakdown,
} from "./memoValidation";
import { SETTLEMENT_MEMO_PREFIX } from "./constants";

export {
  validateMemo,
  validateShortCode,
  buildSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  generateShortCode,
  STELLAR_MEMO_MAX_BYTES,
  PREFIX_BYTES,
  MAX_SHORT_CODE_BYTES,
  SETTLEMENT_MEMO_PREFIX,
  type MemoValidationResult,
  type MemoBreakdown,
};

/** Memo verification status breakdown for UI warning banners. */
export type MemoSeverity = "none" | "missing" | "malformed" | "invalid_length" | "deviation";

export interface MemoVerificationResult {
  isValid: boolean;
  severity: MemoSeverity;
  title: string;
  message: string;
  actionHint?: string;
  suggestedMemo?: string;
  byteLength: number;
}

/**
 * Regex validating standard Mergepay `MP:<code>` structure.
 * Prefix is "MP:", followed by 1 to 25 ASCII alphanumeric/hyphen characters.
 */
export const MERGEPAY_MEMO_REGEX = /^MP:[a-z0-9-]+$/i;

/**
 * Checks whether a given string adheres to the Mergepay `MP:<code>` format.
 */
export function isValidMergepayMemo(memo: string | null | undefined): boolean {
  if (!memo) return false;
  const trimmed = memo.trim();
  if (!trimmed.startsWith(SETTLEMENT_MEMO_PREFIX)) return false;
  const shortCode = trimmed.slice(SETTLEMENT_MEMO_PREFIX.length);
  if (!shortCode || shortCode.length > MAX_SHORT_CODE_BYTES) return false;
  return MERGEPAY_MEMO_REGEX.test(trimmed) && new TextEncoder().encode(trimmed).length <= STELLAR_MEMO_MAX_BYTES;
}

/**
 * Verifies transaction memo and produces actionable user warnings for payment flows.
 *
 * @param memo Raw user input or proposed transaction memo.
 * @param expectedShortCode Optional expected expense short code to verify alignment.
 */
export function verifyTransactionMemo(
  memo: string | null | undefined,
  expectedShortCode?: string
): MemoVerificationResult {
  const byteLength = memo ? new TextEncoder().encode(memo.trim()).length : 0;
  const suggestedMemo = expectedShortCode ? buildSettlementMemo(expectedShortCode) ?? undefined : undefined;

  // Case 1: Missing memo
  if (!memo || memo.trim() === "") {
    return {
      isValid: false,
      severity: "missing",
      title: "Missing Settlement Memo",
      message: "This payment does not include a reconciliation memo. Automated debt clearing requires an MP:<code> memo.",
      actionHint: "Without this memo, off-chain debt cannot be marked as paid automatically and requires manual coordinator review.",
      suggestedMemo,
      byteLength: 0,
    };
  }

  const trimmed = memo.trim();

  // Case 2: Byte length overflow
  if (byteLength > STELLAR_MEMO_MAX_BYTES) {
    return {
      isValid: false,
      severity: "invalid_length",
      title: "Memo Exceeds Stellar Limit",
      message: `Memo is ${byteLength} bytes, exceeding the Stellar ledger limit of ${STELLAR_MEMO_MAX_BYTES} bytes.`,
      actionHint: "Please shorten the memo before signing with Freighter to prevent transaction rejection.",
      suggestedMemo,
      byteLength,
    };
  }

  // Case 3: Missing MP: prefix or malformed structure
  if (!trimmed.startsWith(SETTLEMENT_MEMO_PREFIX)) {
    return {
      isValid: false,
      severity: "malformed",
      title: "Unrecognized Memo Format",
      message: `Memo "${trimmed}" does not begin with the required "${SETTLEMENT_MEMO_PREFIX}" prefix.`,
      actionHint: `Prepend "${SETTLEMENT_MEMO_PREFIX}" or use the generated settlement code to enable automated reconciliation.`,
      suggestedMemo,
      byteLength,
    };
  }

  const code = trimmed.slice(SETTLEMENT_MEMO_PREFIX.length);
  if (!code || code.trim() === "") {
    return {
      isValid: false,
      severity: "malformed",
      title: "Empty Reconciliation Code",
      message: `The memo contains "${SETTLEMENT_MEMO_PREFIX}" but lacks a reconciliation short code.`,
      actionHint: "Append the specific expense identifier (e.g. MP:dinner-8f3a).",
      suggestedMemo,
      byteLength,
    };
  }

  // Case 4: Invalid characters in code
  if (!/^[a-z0-9-]+$/i.test(code)) {
    return {
      isValid: false,
      severity: "malformed",
      title: "Invalid Memo Characters",
      message: "The short code contains unsupported special characters or spaces.",
      actionHint: "Use only letters, numbers, and hyphens in settlement memos.",
      suggestedMemo,
      byteLength,
    };
  }

  // Case 5: Deviation from expected code
  if (expectedShortCode && code.toLowerCase() !== expectedShortCode.toLowerCase()) {
    return {
      isValid: true, // structurally valid on Stellar, but flags deviation warning
      severity: "deviation",
      title: "Reconciliation Code Mismatch",
      message: `Memo code "${code}" differs from the expected expense code "${expectedShortCode}".`,
      actionHint: "Double-check that you are settling the intended expense before submitting.",
      suggestedMemo,
      byteLength,
    };
  }

  // Fully valid
  return {
    isValid: true,
    severity: "none",
    title: "Valid Settlement Memo",
    message: "Memo conforms to Mergepay on-chain reconciliation requirements.",
    suggestedMemo,
    byteLength,
  };
}
