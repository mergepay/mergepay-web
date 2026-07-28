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
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Convert to plain decimal, then strip trailing zeros after decimal point.
  // toFixed(20) gives us enough precision to capture all 7 stroop digits without
  // exponential notation even for very small values like 1e-7.
  const fixed = n.toFixed(20);
  // Remove trailing zeros but keep at least one digit after the decimal if present.
  const plain = fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return plain;
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
  const plain = parseAmount(raw);
  if (plain === null) {
    return "Enter a valid positive amount.";
  }

  // Count decimal places in the canonical plain form.
  const dotIdx = plain.indexOf(".");
  if (dotIdx !== -1) {
    const decimals = plain.length - dotIdx - 1;
    if (decimals > MAX_DECIMAL_PLACES) {
      return `Amount cannot exceed ${MAX_DECIMAL_PLACES} decimal places (1 stroop).`;
    }
  }

  return null;
}

/**
 * Normalize a raw amount string to a plain decimal string with at most 7 dp.
 * Throws if the amount is invalid — always call `validateAmount` first, or
 * guard with a null-check.
 */
export function normalizeAmount(raw: string): string {
  const plain = parseAmount(raw);
  if (plain === null) {
    throw new Error(`Invalid amount: "${raw}"`);
  }

  const dotIdx = plain.indexOf(".");
  if (dotIdx !== -1) {
    const decimals = plain.length - dotIdx - 1;
    if (decimals > MAX_DECIMAL_PLACES) {
      throw new Error(
        `Amount "${raw}" exceeds ${MAX_DECIMAL_PLACES} decimal places.`
      );
    }
  }

  return plain;
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
  const plain = parseAmount(amount);
  if (plain === null) throw new Error(`Cannot convert "${amount}" to stroops.`);

  const dotIdx = plain.indexOf(".");
  if (dotIdx === -1) {
    return BigInt(plain) * BigInt(10_000_000);
  }

  const intPart = plain.slice(0, dotIdx);
  const fracPart = plain.slice(dotIdx + 1).padEnd(MAX_DECIMAL_PLACES, "0");
  // Truncate if more than 7 dp (shouldn't happen after normalizeAmount, but be safe).
  const stroopFrac = fracPart.slice(0, MAX_DECIMAL_PLACES);
  return BigInt(intPart) * BigInt(10_000_000) + BigInt(stroopFrac);
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
