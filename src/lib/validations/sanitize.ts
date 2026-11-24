/**
 * Input sanitization primitives shared by the expense form schemas (#884).
 *
 * Two jobs live here:
 *
 * 1. **Free text** (titles, descriptions). Values are NFC-normalised, invisible
 *    formatting characters are stripped and whitespace runs collapse to one
 *    space. Bidi override/isolate characters are the important case: a title
 *    such as `"Rent ‮gnp.exe"` renders reversed in every list it appears
 *    in, which is a spoofing vector, and zero-width characters make two titles
 *    that look identical compare unequal.
 *
 * 2. **Stellar amounts.** Stellar stores every amount as a signed 64-bit count
 *    of stroops (1 stroop = 0.0000001), so a value is only representable when
 *    it is a plain, positive decimal with at most 7 fractional digits and no
 *    more than `INT64_MAX` stroops. Everything here works on strings and
 *    bigints. `parseFloat` would accept `"1e5"`, `"50abc"` and `"Infinity"`, and
 *    it rounds past 15 significant digits.
 *
 * This module imports nothing from the rest of `src/lib`, so any validator can
 * use it without creating a circular import (`validation.ts` and
 * `expenseValidation.ts` already import each other's helpers).
 */

/** Fractional digits a Stellar amount can carry. */
export const STELLAR_DECIMAL_PLACES = 7;

/** Largest amount Stellar can represent, in stroops (int64 max). */
export const MAX_AMOUNT_STROOPS = 9_223_372_036_854_775_807n;

/** C0 control characters and DEL. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Invisible formatting characters that change how text renders or compares
 * without being visible: zero-width space/joiners, LRM/RLM, the bidi
 * embedding/override range, bidi isolates, word joiner and the BOM.
 */
const INVISIBLE_FORMATTING = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** `true` when the value contains a C0 control character or DEL. */
export function hasControlCharacters(value: string): boolean {
  return CONTROL_CHARS.test(value);
}

/**
 * Normalise a single-line, user-entered string for storage and display.
 *
 * Idempotent: `sanitizeText(sanitizeText(x)) === sanitizeText(x)`.
 */
export function sanitizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(INVISIBLE_FORMATTING, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain unsigned decimal notation: digits, optionally a dot and more digits. */
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

/** Number of fractional digits in a plain decimal string. */
export function countDecimalPlaces(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

export type StellarAmountIssue =
  | "required"
  | "not_a_number"
  | "too_precise"
  | "not_positive"
  | "too_large";

export type StellarAmountCheck =
  | { ok: true; stroops: bigint }
  | { ok: false; issue: StellarAmountIssue };

/**
 * Classify a raw amount string against Stellar's representable range.
 * Leading and trailing whitespace is ignored; nothing else is coerced, so
 * `"1,000"`, `"+5"`, `"-5"`, `"1e3"` and `".5"` are all `not_a_number`.
 */
export function checkStellarAmount(raw: string): StellarAmountCheck {
  const value = raw.trim();
  if (value === "") return { ok: false, issue: "required" };
  if (!PLAIN_DECIMAL.test(value)) return { ok: false, issue: "not_a_number" };
  if (countDecimalPlaces(value) > STELLAR_DECIMAL_PLACES) {
    return { ok: false, issue: "too_precise" };
  }

  const [whole, fraction = ""] = value.split(".");
  const stroops =
    BigInt(whole) * 10n ** BigInt(STELLAR_DECIMAL_PLACES) +
    BigInt(fraction.padEnd(STELLAR_DECIMAL_PLACES, "0") || "0");

  if (stroops <= 0n) return { ok: false, issue: "not_positive" };
  if (stroops > MAX_AMOUNT_STROOPS) return { ok: false, issue: "too_large" };
  return { ok: true, stroops };
}

/** User-facing copy for each amount issue. `subject` is e.g. "Amount" or "Share amount". */
export function stellarAmountMessage(issue: StellarAmountIssue, subject = "Amount"): string {
  switch (issue) {
    case "required":
      return `${subject} is required`;
    case "not_a_number":
      return `${subject} must be a plain number`;
    case "too_precise":
      return `${subject} must have at most ${STELLAR_DECIMAL_PLACES} decimal places`;
    case "not_positive":
      return `${subject} must be greater than zero`;
    case "too_large":
      return `${subject} exceeds the maximum supported by Stellar`;
  }
}

export type PercentIssue = "required" | "not_finite" | "out_of_range" | "too_precise";

/**
 * Is `percent` a usable split ratio: finite, above 0 and at most 100, with at
 * most two decimal places? A 0% row is malformed: it names a participant who
 * owes nothing, and the split engines reject it. Returns `null` when usable.
 */
export function checkSplitPercent(percent: number | null | undefined): PercentIssue | null {
  if (percent === undefined || percent === null || Number.isNaN(percent)) return "required";
  if (!Number.isFinite(percent)) return "not_finite";
  if (percent <= 0 || percent > 100) return "out_of_range";
  if (Math.abs(percent * 100 - Math.round(percent * 100)) > 1e-9) return "too_precise";
  return null;
}

export function splitPercentMessage(issue: PercentIssue): string {
  switch (issue) {
    case "required":
      return "Enter a percentage for every participant";
    case "not_finite":
      return "Percentage must be a finite number";
    case "out_of_range":
      return "Percentage must be greater than 0 and at most 100";
    case "too_precise":
      return "Percentages must have at most 2 decimal places";
  }
}
