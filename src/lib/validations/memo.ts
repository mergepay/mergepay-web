/**
 * Mergepay transaction memo validation.
 *
 * Settlement payments carry a structured `MP:<code>` memo so the backend can
 * reconcile debts from the Stellar ledger without trusting off-chain state.
 * The format is strict, and a malformed memo is not a cosmetic problem: it
 * produces a payment nobody can attribute, so it is worth rejecting before a
 * transaction is ever built or signed.
 *
 * This module holds the pure, dependency-free logic so it can be unit tested
 * and reused by the API boundary, the expense form, and settlement flows
 * without pulling in React.
 *
 * @module validations/memo
 */

import { z } from "zod";

import { SETTLEMENT_MEMO_PREFIX } from "../constants";
import { STELLAR_MEMO_MAX_BYTES } from "../memoValidation";

export { SETTLEMENT_MEMO_PREFIX, STELLAR_MEMO_MAX_BYTES };

/**
 * The Mergepay memo format: the literal `MP:` prefix followed by a
 * reconciliation code of letters, digits, hyphens, and underscores.
 *
 * Anchored on both ends, so trailing newlines or a second `MP:` segment fail
 * rather than being silently trimmed into something that looks valid.
 */
export const MERGEPAY_MEMO_REGEX = /^MP:[A-Za-z0-9_-]+$/;

export interface MemoValidationResult {
  valid: boolean;
  /** User-facing reason, present only when `valid` is false. */
  error?: string;
  /** UTF-8 byte length of the memo — the limit that actually binds on Stellar. */
  byteLength: number;
  /** The reconciliation code after the `MP:` prefix. */
  shortCode?: string;
}

/** UTF-8 byte length, which is what the Stellar text-memo limit counts. */
export function memoByteLength(memo: string): number {
  return new TextEncoder().encode(memo).length;
}

/**
 * Validate a Mergepay settlement memo.
 *
 * Accepts `null`/`undefined`/empty as "no memo" — the memo is optional on an
 * expense, and callers that want it mandatory check `valid` on a non-empty
 * value. Surrounding whitespace is tolerated (users paste with newlines);
 * anything else must match {@link MERGEPAY_MEMO_REGEX} byte for byte.
 */
export function validateMergepayMemo(
  memo: string | null | undefined,
  options: { required?: boolean } = {}
): MemoValidationResult {
  const { required = false } = options;

  if (memo == null || memo.trim() === "") {
    if (required) {
      return {
        valid: false,
        error: `Memo is required and must look like ${SETTLEMENT_MEMO_PREFIX}dinner-1a2b`,
        byteLength: 0,
      };
    }
    return { valid: true, byteLength: 0 };
  }

  const trimmed = memo.trim();
  const byteLength = memoByteLength(trimmed);

  if (byteLength > STELLAR_MEMO_MAX_BYTES) {
    return {
      valid: false,
      error: `Memo is ${byteLength} bytes — Stellar allows at most ${STELLAR_MEMO_MAX_BYTES}. Shorten the reconciliation code.`,
      byteLength,
    };
  }

  if (!MERGEPAY_MEMO_REGEX.test(trimmed)) {
    // Distinguish "wrong prefix" from "bad characters" — the fix is different,
    // and a single generic message sends people editing the wrong half.
    if (!trimmed.startsWith(SETTLEMENT_MEMO_PREFIX)) {
      return {
        valid: false,
        error: `Memo must start with "${SETTLEMENT_MEMO_PREFIX}" — for example ${SETTLEMENT_MEMO_PREFIX}dinner-1a2b`,
        byteLength,
      };
    }
    return {
      valid: false,
      error:
        "Memo code may only contain letters, numbers, hyphens, and underscores",
      byteLength,
    };
  }

  return {
    valid: true,
    byteLength,
    shortCode: trimmed.slice(SETTLEMENT_MEMO_PREFIX.length),
  };
}

/** Boolean form of {@link validateMergepayMemo}. */
export function isValidMergepayMemo(memo: string | null | undefined): boolean {
  return validateMergepayMemo(memo).valid;
}

/**
 * Build a Mergepay memo from a bare reconciliation code (no `MP:` prefix).
 * Returns `null` when the code cannot produce a valid memo.
 */
export function buildMergepayMemo(shortCode: string): string | null {
  const memo = `${SETTLEMENT_MEMO_PREFIX}${shortCode}`;
  return validateMergepayMemo(memo).valid ? memo : null;
}

/**
 * Zod schema for an optional Mergepay memo, sharing the exact error copy the
 * pure validator produces. An empty string normalises to `undefined` so
 * "cleared the field" and "never filled it in" are the same value.
 */
export const mergepayMemoSchema = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === "" ? undefined : value))
  .refine(
    (value) => validateMergepayMemo(value).valid,
    (value) => ({
      message:
        validateMergepayMemo(value).error ??
        "Memo is not a valid Mergepay settlement memo",
    })
  );
