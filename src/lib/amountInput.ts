/**
 * Helpers for the text a user is editing in a Stellar amount field.
 *
 * `expenseValidation.ts` decides which keystrokes may enter the field
 * (`isTypableAmount`); this module decides how a *finished* entry is tidied
 * once the field is committed. Only changes that cannot alter what the user
 * meant — and that no maintainer-facing rule depends on — are made here.
 *
 * A trailing dot (`"7."`) is deliberately left alone: the e2e spec for the
 * amount field requires a committed half-typed amount to be flagged and
 * announced rather than silently repaired, so the validators keep reporting it.
 *
 * Pure and free of React imports so it is unit-testable and usable from route
 * handlers.
 */

import { AMOUNT_DECIMAL_PLACES } from "./expenseValidation";

/** Plain unsigned decimal, optionally half-typed (`"5."`, `".5"`). */
const COMMITTABLE_AMOUNT = /^(\d*)(?:\.(\d*))?$/;

/**
 * Tidy a committed amount entry.
 *
 * - surrounding whitespace is dropped
 * - a lone `"."` or an empty value becomes `""`
 * - `".5"` becomes `"0.5"`
 * - redundant leading zeros are dropped (`"007.50"` becomes `"7.50"`)
 *
 * Digits are never added, removed or rounded, so `"12.50"` stays `"12.50"`. A
 * trailing dot (`"5."`) and a value with too many decimals are returned as
 * typed for the validator to report. Anything that is not a plain unsigned
 * decimal (signs, exponents, separators) is also returned as typed, rather
 * than being silently repaired into a different number.
 */
export function formatAmountInput(
  raw: string,
  decimalPlaces: number = AMOUNT_DECIMAL_PLACES
): string {
  const value = raw.trim();
  const match = COMMITTABLE_AMOUNT.exec(value);
  if (!match) return raw;

  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (whole === "" && fraction === "") return "";
  if (fraction.length > decimalPlaces) return raw;

  // A trailing dot is a half-typed amount; leave it for the validator.
  if (value.endsWith(".")) return value;

  const normalisedWhole = whole === "" ? "0" : whole.replace(/^0+(?=\d)/, "");
  return fraction === "" ? normalisedWhole : `${normalisedWhole}.${fraction}`;
}
