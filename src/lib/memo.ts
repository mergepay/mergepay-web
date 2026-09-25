/**
 * Parsing and validation for Stellar transaction memos.
 *
 * Mergepay stamps every settlement payment with a structured memo so an
 * on-chain transfer can be reconciled with the off-chain expense it pays
 * for. The format is `MP:<code>` — the prefix lives in `./constants`
 * (`SETTLEMENT_MEMO_PREFIX`) because the API builds the transaction with it
 * too.
 *
 * This module is deliberately free of React and of any browser API, so the
 * rules can be unit-tested directly and shared by every view that renders a
 * transaction. The only platform dependency is `TextEncoder`, available in
 * Node and every browser the app targets.
 */

import { SETTLEMENT_MEMO_PREFIX } from "./constants";

/** Maximum size, in bytes, of a Stellar text memo (`MEMO_TEXT`). */
export const MEMO_MAX_BYTES = 28;

/**
 * Characters allowed in the code after the `MP:` prefix. Keep this in sync
 * with the API, which generates the code from expense ids (`dinner-8f3a`,
 * `AB12CD`).
 */
const MEMO_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

export type MemoStatus = "valid" | "malformed";

/** Why a memo is malformed — a machine-readable companion to `detail`. */
export type MemoIssue =
  | "wrong_prefix"
  | "empty_code"
  | "invalid_characters"
  | "too_long";

export interface ParsedMemo {
  /** The memo exactly as stored, trimmed of surrounding whitespace. */
  raw: string;
  status: MemoStatus;
  /** The expense reference after `MP:` — only set when the memo is valid. */
  code: string | null;
  issue: MemoIssue | null;
  /** One sentence of plain text explaining the verdict. */
  detail: string;
}

function byteLength(value: string): number {
  if (typeof TextEncoder === "undefined") return value.length;
  return new TextEncoder().encode(value).length;
}

/**
 * Trim a memo and collapse `null`/empty input to `null`. Callers use this to
 * decide whether there is anything to render at all.
 */
export function normalizeMemo(memo: string | null | undefined): string | null {
  if (typeof memo !== "string") return null;
  const trimmed = memo.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate a memo against the `MP:<code>` format.
 *
 * Returns `null` when there is nothing to inspect (missing or blank memo) so
 * consumers can render nothing rather than a badge for an empty value.
 */
export function parseMemo(memo: string | null | undefined): ParsedMemo | null {
  const raw = normalizeMemo(memo);
  if (raw === null) return null;

  const malformed = (issue: MemoIssue, detail: string): ParsedMemo => ({
    raw,
    status: "malformed",
    code: null,
    issue,
    detail,
  });

  if (!raw.startsWith(SETTLEMENT_MEMO_PREFIX)) {
    return malformed(
      "wrong_prefix",
      `Mergepay settlement memos must start with "${SETTLEMENT_MEMO_PREFIX}".`
    );
  }

  if (byteLength(raw) > MEMO_MAX_BYTES) {
    return malformed(
      "too_long",
      `This memo is longer than the ${MEMO_MAX_BYTES}-byte Stellar limit.`
    );
  }

  const code = raw.slice(SETTLEMENT_MEMO_PREFIX.length);

  if (code.length === 0) {
    return malformed(
      "empty_code",
      `The memo has no expense code after "${SETTLEMENT_MEMO_PREFIX}".`
    );
  }

  if (!MEMO_CODE_PATTERN.test(code)) {
    return malformed(
      "invalid_characters",
      "The expense code may only contain letters, numbers, hyphens, and underscores."
    );
  }

  return {
    raw,
    status: "valid",
    code,
    issue: null,
    detail: `Linked to expense reference ${code}.`,
  };
}

/**
 * Whether a memo follows the `MP:<code>` format. Convenience wrapper for
 * callers that only need the boolean.
 */
export function isValidSettlementMemo(
  memo: string | null | undefined
): boolean {
  return parseMemo(memo)?.status === "valid";
}
