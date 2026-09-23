/**
 * Stellar memo validation and settlement memo builder.
 *
 * On-chain settlements rely on specific memo formats (`MP:<code>`) to
 * reconcile payments automatically. This module enforces Stellar ledger
 * constraints and provides a builder for the Mergepay memo convention.
 *
 * Stellar memo rules (text type):
 *  - Maximum 28 bytes (UTF-8 encoded)
 *  - No null bytes
 *  - No control characters (U+0000–U+001F, U+007F–U+009F)
 *
 * Mergepay convention:
 *  - Prefix: `MP:` (3 bytes)
 *  - Short code: user-facing reconciliation identifier (e.g. `dinner-8f3a`)
 *  - Total must stay within the 28-byte Stellar text memo limit
 *
 * @module memoValidation
 */

import { z } from "zod";
import { SETTLEMENT_MEMO_PREFIX } from "./constants";

// ---------------------------------------------------------------------------
// Short-code generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic short code for a settlement memo.
 *
 * The code encodes the expense title (or a fallback) and a 4-character hex
 * suffix derived from the amount, producing something like `dinner-8f3a`.
 * The result is ASCII-safe and fits comfortably within the 25-byte budget
 * after the `MP:` prefix.
 *
 * @param label   Human-readable label (e.g. expense title or "settle-up").
 * @param amount  Decimal amount string, used to derive the hex suffix.
 */
export function generateShortCode(label: string, amount: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16); // leave room for dash + 4-hex suffix

  // Simple deterministic hex from amount string
  let hash = 0;
  for (const ch of amount) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  const hex = ((hash >>> 0) & 0xffff).toString(16).padStart(4, "0");

  return `${slug || "settle"}-${hex}`;
}

// ---------------------------------------------------------------------------
// Stellar ledger constraints
// ---------------------------------------------------------------------------

/** Maximum byte length for a Stellar text memo (28 bytes). */
export const STELLAR_MEMO_MAX_BYTES = 28;

/** Bytes occupied by the Mergepay prefix (`MP:`). */
export const PREFIX_BYTES = new TextEncoder().encode(SETTLEMENT_MEMO_PREFIX)
  .length;

/** Maximum byte length for the short-code portion after the prefix. */
export const MAX_SHORT_CODE_BYTES = STELLAR_MEMO_MAX_BYTES - PREFIX_BYTES;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface MemoValidationResult {
  valid: boolean;
  /** Human-readable error when `valid` is false. */
  error?: string;
  /** The byte length of the memo (for display / debugging). */
  byteLength?: number;
}

export interface MemoBreakdown {
  /** Raw memo string (e.g. `"MP:dinner-8f3a"`). */
  memo: string;
  /** Prefix portion (e.g. `"MP:"`). */
  prefix: string;
  /** Short code portion after the prefix (e.g. `"dinner-8f3a"`). */
  shortCode: string;
  /** Total byte length. */
  byteLength: number;
  /** Maximum allowed byte length. */
  maxLength: number;
  /** Byte budget remaining after the current memo. */
  remainingBytes: number;
  /** Whether the memo conforms to the Mergepay `MP:` convention. */
  conformsToConvention: boolean;
  /** Warnings (e.g. manual edits that deviate from the required code). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** ASCII control characters (C0 + DEL + C1) that are invalid in Stellar memos. */
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f-\x9f]/;

/** Validate a raw memo string against Stellar ledger constraints. */
export function validateMemo(raw: string | null | undefined): MemoValidationResult {
  if (raw == null) {
    return { valid: false, error: "Memo is required for settlement reconciliation." };
  }

  const memo = raw.trim();
  if (memo === "") {
    return { valid: false, error: "Memo cannot be empty." };
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(memo);
  const byteLength = bytes.length;

  if (byteLength > STELLAR_MEMO_MAX_BYTES) {
    return {
      valid: false,
      error: `Memo exceeds the Stellar limit of ${STELLAR_MEMO_MAX_BYTES} bytes (currently ${byteLength} bytes). Shorten the reconciliation code.`,
      byteLength,
    };
  }

  if (CONTROL_CHAR_RE.test(memo)) {
    return {
      valid: false,
      error: "Memo contains control characters that are not allowed on Stellar.",
      byteLength,
    };
  }

  return { valid: true, byteLength };
}

/** Validate only the short-code portion (after the prefix). */
export function validateShortCode(
  shortCode: string | null | undefined
): MemoValidationResult {
  if (shortCode == null || shortCode === "") {
    return { valid: false, error: "Reconciliation code is required." };
  }

  const code = shortCode.trim();

  if (code !== shortCode) {
    return {
      valid: false,
      error: "Reconciliation code must not have leading or trailing whitespace.",
    };
  }

  const encoder = new TextEncoder();
  const byteLength = encoder.encode(code).length;

  if (byteLength > MAX_SHORT_CODE_BYTES) {
    return {
      valid: false,
      error: `Reconciliation code exceeds ${MAX_SHORT_CODE_BYTES} bytes (currently ${byteLength}). Shorten it.`,
      byteLength,
    };
  }

  if (CONTROL_CHAR_RE.test(code)) {
    return {
      valid: false,
      error: "Reconciliation code contains control characters.",
      byteLength,
    };
  }

  if (code.includes(SETTLEMENT_MEMO_PREFIX)) {
    return {
      valid: false,
      error: `Reconciliation code must not contain the prefix "${SETTLEMENT_MEMO_PREFIX}".`,
    };
  }

  return { valid: true, byteLength };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a Mergepay settlement memo from a short code.
 *
 * Returns `null` when the input is invalid — callers should use
 * `validateShortCode` to get a specific error message before calling this.
 */
export function buildSettlementMemo(shortCode: string | null | undefined): string | null {
  const validation = validateShortCode(shortCode);
  if (!validation.valid || !shortCode) return null;
  return `${SETTLEMENT_MEMO_PREFIX}${shortCode.trim()}`;
}

// ---------------------------------------------------------------------------
// Breakdown & warnings
// ---------------------------------------------------------------------------

/**
 * Produce a human-readable breakdown of a settlement memo, including
 * byte-count information and any deviation warnings.
 *
 * @param memo        The full memo string (e.g. `"MP:dinner-8f3a"`)
 * @param expectedCode  The expected short code from the settlement, if known.
 *                      When provided, a warning is emitted if `memo` deviates.
 */
export function breakdownMemo(
  memo: string | null | undefined,
  expectedCode?: string | null
): MemoBreakdown {
  const empty: MemoBreakdown = {
    memo: memo ?? "",
    prefix: "",
    shortCode: "",
    byteLength: 0,
    maxLength: STELLAR_MEMO_MAX_BYTES,
    remainingBytes: STELLAR_MEMO_MAX_BYTES,
    conformsToConvention: false,
    warnings: [],
  };

  if (!memo) return empty;

  const encoder = new TextEncoder();
  const byteLength = encoder.encode(memo).length;
  const conformsToConvention = memo.startsWith(SETTLEMENT_MEMO_PREFIX);

  const prefix = conformsToConvention ? SETTLEMENT_MEMO_PREFIX : "";
  const shortCode = conformsToConvention ? memo.slice(prefix.length) : memo;

  const warnings: string[] = [];

  if (!conformsToConvention) {
    warnings.push(
      `Memo does not start with the Mergepay prefix "${SETTLEMENT_MEMO_PREFIX}". Reconciliation may fail.`
    );
  }

  if (expectedCode && shortCode !== expectedCode) {
    warnings.push(
      `Memo deviates from the expected reconciliation code "${expectedCode}". Manual edits may prevent automatic reconciliation.`
    );
  }

  return {
    memo,
    prefix,
    shortCode,
    byteLength,
    maxLength: STELLAR_MEMO_MAX_BYTES,
    remainingBytes: Math.max(0, STELLAR_MEMO_MAX_BYTES - byteLength),
    conformsToConvention,
    warnings,
  };
}

/**
 * Warn when a user-edited memo deviates from the required reconciliation
 * code. Returns the list of warnings (empty when the memo is correct).
 *
 * @param editedMemo   The user-edited memo string
 * @param originalCode The short code originally generated by the system
 */
export function detectMemoDeviations(
  editedMemo: string,
  originalCode: string
): string[] {
  const original = buildSettlementMemo(originalCode);
  if (original === null) return ["Original reconciliation code is invalid."];

  if (editedMemo === original) return [];

  const warnings: string[] = [];

  if (editedMemo !== original) {
    warnings.push(
      'Manual memo edits may prevent automatic reconciliation. The expected memo is "' +
        original +
        '".'
    );
  }

  if (!editedMemo.startsWith(SETTLEMENT_MEMO_PREFIX)) {
    warnings.push(
      `Memo does not start with "${SETTLEMENT_MEMO_PREFIX}". This is required for on-chain identification.`
    );
  }

  const validation = validateMemo(editedMemo);
  if (!validation.valid) {
    warnings.push(validation.error!);
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Sanitization & Parsing Utilities (Closes #389)
// ---------------------------------------------------------------------------

/**
 * Sanitize a raw memo or short-code input string.
 * Strips ASCII control characters and null bytes, normalizes whitespace.
 *
 * @param input Raw user or transaction input string
 */
export function sanitizeMemoInput(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Zod schema for validating raw Stellar text memos (max 28 UTF-8 bytes, no control chars).
 */
export const stellarTextMemoSchema = z
  .string()
  .min(1, { message: "Memo cannot be empty." })
  .refine(
    (val) => new TextEncoder().encode(val.trim()).length <= STELLAR_MEMO_MAX_BYTES,
    {
      message: `Memo exceeds the Stellar limit of ${STELLAR_MEMO_MAX_BYTES} bytes.`,
    }
  )
  .refine((val) => !CONTROL_CHAR_RE.test(val), {
    message: "Memo contains control characters that are not allowed on Stellar.",
  });

/**
 * Zod schema for validating Mergepay structured settlement memos (`MP:<code>`).
 */
export const mergepaySettlementMemoSchema = stellarTextMemoSchema
  .refine((val) => val.startsWith(SETTLEMENT_MEMO_PREFIX), {
    message: `Memo must start with the Mergepay prefix "${SETTLEMENT_MEMO_PREFIX}".`,
  })
  .refine(
    (val) => {
      const code = val.slice(SETTLEMENT_MEMO_PREFIX.length);
      return code.length > 0 && !code.includes(SETTLEMENT_MEMO_PREFIX);
    },
    {
      message: "Memo must contain a valid reconciliation short code.",
    }
  );

export interface ParsedSettlementMemo {
  valid: boolean;
  prefix?: string;
  shortCode?: string;
  error?: string;
}

/**
 * Parse a full settlement memo into its prefix and reconciliation short code.
 *
 * @param rawMemo The memo string to parse
 */
export function parseSettlementMemo(rawMemo: string | null | undefined): ParsedSettlementMemo {
  const validation = validateMemo(rawMemo);
  if (!validation.valid || !rawMemo) {
    return { valid: false, error: validation.error ?? "Invalid memo." };
  }

  const memo = rawMemo.trim();
  if (!memo.startsWith(SETTLEMENT_MEMO_PREFIX)) {
    return {
      valid: false,
      error: `Memo does not match expected prefix "${SETTLEMENT_MEMO_PREFIX}".`,
    };
  }

  const shortCode = memo.slice(SETTLEMENT_MEMO_PREFIX.length).trim();
  const codeValidation = validateShortCode(shortCode);
  if (!codeValidation.valid) {
    return { valid: false, error: codeValidation.error ?? "Invalid reconciliation code." };
  }

  return {
    valid: true,
    prefix: SETTLEMENT_MEMO_PREFIX,
    shortCode,
  };
}

export interface ExtractedExpenseReference {
  valid: boolean;
  shortCode?: string;
  expenseSlug?: string;
  hashSuffix?: string;
  error?: string;
}

/**
 * Extract expense reference details (slug and hash suffix) from a Mergepay memo.
 *
 * @param rawMemo Full memo string (e.g., "MP:dinner-8f3a")
 */
export function extractExpenseReferenceFromMemo(
  rawMemo: string | null | undefined
): ExtractedExpenseReference {
  const parsed = parseSettlementMemo(rawMemo);
  if (!parsed.valid || !parsed.shortCode) {
    return { valid: false, error: parsed.error };
  }

  const shortCode = parsed.shortCode;
  const parts = shortCode.split("-");

  if (parts.length < 2) {
    return {
      valid: true,
      shortCode,
      expenseSlug: shortCode,
    };
  }

  const hashSuffix = parts[parts.length - 1];
  const expenseSlug = parts.slice(0, -1).join("-");

  return {
    valid: true,
    shortCode,
    expenseSlug,
    hashSuffix,
  };
}

export interface ExtractedTransactionSettlement {
  matched: boolean;
  memo?: string;
  shortCode?: string;
  expenseSlug?: string;
  hashSuffix?: string;
  error?: string;
}

/**
 * Extract and verify a settlement reference from an incoming Stellar transaction payload.
 * Supports Horizon transaction objects, Soroban event logs, or generic payment operation payloads.
 *
 * @param txPayload Transaction payload object containing memo or memo_text
 */
export function extractSettlementFromTransactionPayload(
  txPayload: unknown
): ExtractedTransactionSettlement {
  if (!txPayload || typeof txPayload !== "object") {
    return { matched: false, error: "Transaction payload is missing or invalid." };
  }

  const payload = txPayload as Record<string, unknown>;

  // Detect memo string across common Horizon API formats
  let memoValue: string | undefined;

  if (typeof payload.memo === "string") {
    memoValue = payload.memo;
  } else if (typeof payload.memo_text === "string") {
    memoValue = payload.memo_text;
  } else if (payload.memo && typeof payload.memo === "object") {
    const memoObj = payload.memo as Record<string, unknown>;
    if (typeof memoObj.value === "string") {
      memoValue = memoObj.value;
    } else if (typeof memoObj._value === "string") {
      memoValue = memoObj._value;
    }
  }

  if (!memoValue) {
    return { matched: false, error: "Transaction payload does not contain a memo." };
  }

  const sanitized = sanitizeMemoInput(memoValue);
  const ref = extractExpenseReferenceFromMemo(sanitized);

  if (!ref.valid) {
    return { matched: false, memo: sanitized, error: ref.error };
  }

  return {
    matched: true,
    memo: sanitized,
    shortCode: ref.shortCode,
    expenseSlug: ref.expenseSlug,
    hashSuffix: ref.hashSuffix,
  };
}

