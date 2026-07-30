/**
 * Shared money / amount helpers for Stellar-based amounts.
 *
 * Stellar supports up to 7 decimal places (1 stroop = 0.0000001 XLM).
 * All amount strings flowing to the API must:
 *   - be in plain decimal notation (never exponential e.g. "1e-7")
 *   - have at most 7 decimal places
 *   - be strictly positive (> 0)
 *
 * This module is intentionally free of React/Next.js dependencies so it can
 * be imported from both client components and (future) server actions.
 */

/** Maximum decimal places Stellar supports (1 stroop = 10^-7). */
export const MAX_DECIMAL_PLACES = 7;

/** Minimum representable amount on Stellar (1 stroop). */
export const MIN_AMOUNT = "0.0000001";

// ---------------------------------------------------------------------------
// Exact decimal parsing
//
// `Number()` cannot round-trip every 7-dp decimal (e.g. `1.1234567` becomes
// `1.12345670000000003368…`), so anything that has to *compare* amounts — such
// as checking that split shares sum to the expense total — must work on the
// decimal string directly. The helpers below scale a decimal string to an
// integer (bigint) without ever going through a float.
// ---------------------------------------------------------------------------

/** Optional sign, digits with an optional fraction, optional exponent. */
const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

export type DecimalParseError = "empty" | "not_a_number" | "too_precise";

export interface ParsedDecimal {
  /** The value scaled to an integer, e.g. `1.5` at scale 7 → `15000000n`. */
  scaled: bigint;
  /** Canonical plain-decimal form with trailing fractional zeros removed. */
  plain: string;
  /** True when the value is strictly less than zero. */
  negative: boolean;
}

export type DecimalParseResult =
  | { ok: true; value: ParsedDecimal }
  | { ok: false; error: DecimalParseError };

/**
 * Parse a decimal string into an exact scaled integer.
 *
 * Accepts plain (`"1.5"`) and exponential (`"1e-7"`) notation — `type="number"`
 * inputs can produce either — and rejects values that carry more fractional
 * digits than `scale` can represent rather than silently rounding them.
 *
 * @param raw   the user-supplied string
 * @param scale number of fractional digits the result is scaled by
 *
 * @example
 *   parseExactDecimal("1.1234567", 7) // → { ok: true, value: { scaled: 11234567n, … } }
 *   parseExactDecimal("1.12345678", 7) // → { ok: false, error: "too_precise" }
 */
export function parseExactDecimal(
  raw: string,
  scale: number
): DecimalParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "empty" };

  const match = DECIMAL_RE.exec(trimmed);
  if (!match) return { ok: false, error: "not_a_number" };

  const [, sign, intDigits, fracDigits, leadingDotDigits, exponent] = match;
  let digits = (intDigits ?? "") + (fracDigits ?? leadingDotDigits ?? "");
  // Position of the decimal point counted from the right of `digits`.
  let pointFromRight = (fracDigits ?? leadingDotDigits ?? "").length;

  if (exponent) {
    // A positive exponent moves the point right (fewer fractional digits);
    // a negative exponent moves it left (more fractional digits).
    pointFromRight -= Number(exponent);
    if (pointFromRight < 0) {
      digits += "0".repeat(-pointFromRight);
      pointFromRight = 0;
    }
  }

  // Pad so the digit string always has at least `pointFromRight` fraction digits.
  if (digits.length < pointFromRight) {
    digits = "0".repeat(pointFromRight - digits.length) + digits;
  }

  const intPart = digits.slice(0, digits.length - pointFromRight) || "0";
  const fracPart = pointFromRight === 0 ? "" : digits.slice(digits.length - pointFromRight);
  const significantFrac = fracPart.replace(/0+$/, "");
  if (significantFrac.length > scale) return { ok: false, error: "too_precise" };

  const scaledDigits = intPart + significantFrac.padEnd(scale, "0");
  const magnitude = BigInt(scaledDigits);
  const negative = sign === "-" && magnitude !== BigInt(0);

  const canonicalInt = intPart.replace(/^0+(?=\d)/, "");
  const plain =
    (negative ? "-" : "") +
    (significantFrac ? `${canonicalInt}.${significantFrac}` : canonicalInt);

  return {
    ok: true,
    value: { scaled: negative ? -magnitude : magnitude, plain, negative },
  };
}

/** Convenience wrapper: parse a Stellar amount to exact stroops. */
export function parseExactAmount(raw: string): DecimalParseResult {
  return parseExactDecimal(raw, MAX_DECIMAL_PLACES);
}

/**
 * Parse a raw amount string (which may come from a `type="number"` input,
 * and therefore might be in exponential notation such as "1e-7") into a
 * plain decimal string, or `null` if the value is not a valid positive number.
 *
 * @example
 *   parseAmount("1e-7")  // → "0.0000001"
 *   parseAmount("1.5")   // → "1.5"
 *   parseAmount("0")     // → null  (zero is not a valid positive amount)
 *   parseAmount("abc")   // → null
 */
export function parseAmount(raw: string): string | null {
  const parsed = parseExactAmount(raw);
  if (!parsed.ok) return null;
  if (parsed.value.scaled <= BigInt(0)) return null;
  return parsed.value.plain;
}

/**
 * Validate that `raw` is a valid Stellar amount:
 *   - finite positive number
 *   - at most 7 decimal places
 *   - not in exponential notation when entered (we accept it and reformat)
 *
 * @returns An error message string, or `null` if valid.
 */
export function validateAmount(raw: string): string | null {
  const parsed = parseExactAmount(raw);
  if (!parsed.ok) {
    return parsed.error === "too_precise"
      ? `Amount cannot exceed ${MAX_DECIMAL_PLACES} decimal places (1 stroop).`
      : "Enter a valid positive amount.";
  }
  if (parsed.value.scaled <= BigInt(0)) return "Enter a valid positive amount.";
  return null;
}

/**
 * Normalize a raw amount string to a plain decimal string with at most 7 dp.
 * Throws if the amount is invalid — always call `validateAmount` first, or
 * guard with a null-check.
 */
export function normalizeAmount(raw: string): string {
  const parsed = parseExactAmount(raw);
  if (!parsed.ok) {
    if (parsed.error === "too_precise") {
      throw new Error(
        `Amount "${raw}" exceeds ${MAX_DECIMAL_PLACES} decimal places.`
      );
    }
    throw new Error(`Invalid amount: "${raw}"`);
  }
  if (parsed.value.scaled <= BigInt(0)) {
    throw new Error(`Invalid amount: "${raw}"`);
  }
  return parsed.value.plain;
}

/**
 * Convert a decimal string amount to integer stroops (bigint), so we can do
 * exact comparisons without floating-point rounding.
 *
 * @example
 *   toStroops("1.5")       // → 15000000n
 *   toStroops("0.0000001") // → 1n
 */
export function toStroops(amount: string): bigint {
  const parsed = parseExactAmount(amount);
  if (!parsed.ok || parsed.value.scaled <= BigInt(0)) {
    throw new Error(`Cannot convert "${amount}" to stroops.`);
  }
  return parsed.value.scaled;
}

/**
 * Return `true` if `amountRaw` exceeds `balanceRaw` for the same asset.
 * Uses stroop integer comparison to avoid floating-point errors.
 *
 * @param amountRaw  — the withdrawal amount to check (raw user input string)
 * @param balanceRaw — the treasury balance string from the API
 */
export function exceedsBalance(
  amountRaw: string,
  balanceRaw: string
): boolean {
  try {
    return toStroops(amountRaw) > toStroops(balanceRaw);
  } catch {
    // If either value can't be parsed, treat as exceeding (safest default).
    return true;
  }
}
