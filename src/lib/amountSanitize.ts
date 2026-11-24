/**
 * Asset-aware precision and paste sanitisation for expense amounts (#897).
 *
 * Keystrokes are already filtered by `isTypableAmount` (anything that is not
 * an unsigned decimal is refused). Pasted text is different: people copy
 * amounts out of bank statements, chat apps and spreadsheets, so a paste of
 * `"$1,234.50"`, `"12.50 USDC"` or `"1.5e-3"` has an obvious intended value
 * that should be recovered rather than dropped on the floor.
 *
 * `sanitizePastedAmount` performs only *unambiguous* clean-ups and refuses
 * the rest with a reason the form can show inline:
 *
 *  - currency symbols, asset codes and whitespace are stripped;
 *  - grouping separators are removed (`1,234.50`, `1 234,50`, `1.234,50`);
 *  - a single comma used as the decimal mark becomes a dot (`12,50`);
 *  - scientific notation is expanded exactly, with string arithmetic;
 *  - negative values, NaN / Infinity and values exceeding the asset's
 *    precision are refused, never silently flipped or rounded.
 */

import { AMOUNT_DECIMAL_PLACES } from "./expenseValidation";

/**
 * Decimal places accepted per asset code. Stellar stores every amount as a
 * 64-bit integer of stroops (1e-7), so 7 is the hard ceiling for any asset
 * (native XLM and issued tokens alike). Assets listed here may narrow that;
 * anything unlisted gets the Stellar maximum.
 */
export const ASSET_DECIMAL_PLACES: Readonly<Record<string, number>> = {
  XLM: 7,
  USDC: 7,
  EURC: 7,
};

/** Clamp a precision to Stellar's valid 0–7 range. */
export function clampDecimalPlaces(places: number | undefined | null): number {
  if (places === undefined || places === null || !Number.isFinite(places)) {
    return AMOUNT_DECIMAL_PLACES;
  }
  return Math.max(0, Math.min(AMOUNT_DECIMAL_PLACES, Math.floor(places)));
}

/**
 * Decimal places allowed for `assetCode`. An explicit `override` (e.g. a
 * custom token's configured precision) wins over the built-in table.
 */
export function getAssetDecimalPlaces(
  assetCode: string | null | undefined,
  override?: number | null
): number {
  if (override !== undefined && override !== null) return clampDecimalPlaces(override);
  const code = (assetCode ?? "").trim().toUpperCase();
  return clampDecimalPlaces(ASSET_DECIMAL_PLACES[code]);
}

/** Number of digits after the decimal point in a plain decimal string. */
export function countDecimalPlaces(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

export type AmountSanitizeFailure =
  | "empty"
  | "negative"
  | "not_a_number"
  | "too_precise";

export type AmountSanitizeResult =
  | { ok: true; value: string }
  | { ok: false; reason: AmountSanitizeFailure; message: string };

/** Inline copy for a refused paste or keystroke. */
export function amountSanitizeMessage(
  reason: AmountSanitizeFailure,
  decimalPlaces: number = AMOUNT_DECIMAL_PLACES
): string {
  switch (reason) {
    case "negative":
      return "Amounts can't be negative.";
    case "too_precise":
      return decimalPlaces === 0
        ? "This asset only supports whole amounts."
        : `This asset supports at most ${decimalPlaces} decimal place${decimalPlaces === 1 ? "" : "s"}.`;
    case "empty":
    case "not_a_number":
    default:
      return "Only digits and a single decimal point are allowed.";
  }
}

function fail(
  reason: AmountSanitizeFailure,
  decimalPlaces: number
): AmountSanitizeResult {
  return { ok: false, reason, message: amountSanitizeMessage(reason, decimalPlaces) };
}

/**
 * Expand `<mantissa>e<exponent>` into a plain decimal string exactly (no
 * floating point), e.g. `"1.5e-3"` → `"0.0015"`, `"2E3"` → `"2000"`.
 * Returns `null` when the input is not unsigned scientific notation.
 */
export function expandScientificNotation(raw: string): string | null {
  const match = /^(\d*)(?:\.(\d*))?e([+-]?\d+)$/i.exec(raw);
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (whole === "" && fraction === "") return null;
  const exponent = Number(match[3]);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 400) return null;

  // Position of the decimal point measured from the start of `whole + fraction`.
  let point = whole.length + exponent;
  let all = whole + fraction;
  if (point <= 0) {
    all = "0".repeat(1 - point) + all;
    point = 1;
  } else if (point > all.length) {
    all = all + "0".repeat(point - all.length);
  }
  const intPart = all.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  const fracPart = all.slice(point).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/** Remove grouping separators and normalise the decimal mark to `.`. */
function normaliseSeparators(value: string): string | null {
  const commas = (value.match(/,/g) ?? []).length;
  const dots = (value.match(/\./g) ?? []).length;

  if (commas > 0 && dots > 0) {
    // Whichever separator comes last is the decimal mark.
    const decimalMark = value.lastIndexOf(",") > value.lastIndexOf(".") ? "," : ".";
    const group = decimalMark === "," ? "." : ",";
    const parts = value.split(decimalMark);
    if (parts.length !== 2) return null;
    const intPart = parts[0];
    if (!new RegExp(`^\\d{1,3}(?:\\${group}\\d{3})*$`).test(intPart)) return null;
    return `${intPart.split(group).join("")}.${parts[1]}`;
  }

  if (commas > 0) {
    // "1,234" / "1,234,567" are thousands; a single "12,5" is a decimal comma.
    if (/^\d{1,3}(?:,\d{3})+$/.test(value)) return value.replace(/,/g, "");
    if (commas === 1) return value.replace(",", ".");
    return null;
  }

  if (dots > 1) {
    // "1.234.567" — dots as thousands separators only.
    if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) return value.replace(/\./g, "");
    return null;
  }

  return value;
}

/**
 * Clean pasted text into a plain unsigned decimal that fits `decimalPlaces`,
 * or explain why it can't be.
 */
export function sanitizePastedAmount(
  raw: string,
  decimalPlaces: number = AMOUNT_DECIMAL_PLACES
): AmountSanitizeResult {
  const places = clampDecimalPlaces(decimalPlaces);

  // Drop whitespace (incl. NBSP / thin-space grouping), currency symbols and
  // trailing or leading asset codes such as "USDC" or "XLM".
  let value = raw
    .replace(/[\s  ]+/g, "")
    .replace(/[$€£¥₦₹¢]/g, "")
    .replace(/^[A-Za-z]{2,12}(?=[\d.,+-])/, "")
    .replace(/(?<=[\d.])[A-Za-z]{2,12}$/, "");

  if (value === "") return fail("empty", places);
  if (/^\(.*\)$/.test(value) || value.startsWith("-") || value.startsWith("−")) {
    return fail("negative", places);
  }
  if (value.startsWith("+")) value = value.slice(1);
  if (/^(nan|infinity|inf)$/i.test(value)) return fail("not_a_number", places);

  const expanded = expandScientificNotation(value);
  if (expanded !== null) {
    value = expanded;
  } else {
    const separated = normaliseSeparators(value);
    if (separated === null) return fail("not_a_number", places);
    value = separated;
  }

  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return fail("not_a_number", places);

  // Trailing zeros beyond the limit don't change the value ("1.50000000").
  if (value.includes(".")) {
    const [intPart, fracPart] = value.split(".");
    const trimmedFrac =
      fracPart.length > places ? fracPart.replace(/0+$/, "") : fracPart;
    if (trimmedFrac.length > places) return fail("too_precise", places);
    value = trimmedFrac === "" && fracPart.length > places ? intPart : `${intPart}.${trimmedFrac}`;
  }

  return { ok: true, value };
}
