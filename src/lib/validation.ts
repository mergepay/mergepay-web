/**
 * Server-side validation helpers for values that reach the API routes.
 *
 * Kept free of React/Next.js imports so it can be used from route handlers,
 * client components, and unit tests alike.
 */

/** Decimal places Stellar supports for a classic asset (1 stroop = 10^-7). */
export const DEFAULT_ASSET_DECIMALS = 7;

/**
 * Per-asset decimal precision overrides.
 *
 * Every classic Stellar asset is stored on-ledger with 7 decimals, so this map
 * is empty by default; it exists so an asset with a tighter display precision
 * (or a future non-classic asset) can be constrained without touching callers.
 */
export const ASSET_DECIMALS: Readonly<Record<string, number>> = {};

/**
 * Largest amount representable on Stellar: int64 max stroops
 * (9,223,372,036,854,775,807) expressed in whole units.
 */
export const MAX_STROOPS = 9_223_372_036_854_775_807n;

/** Decimal precision allowed for `assetCode`, falling back to Stellar's 7. */
export function decimalsForAsset(assetCode?: string | null): number {
  if (!assetCode) return DEFAULT_ASSET_DECIMALS;
  return ASSET_DECIMALS[assetCode.trim().toUpperCase()] ?? DEFAULT_ASSET_DECIMALS;
}

export interface AmountValidationResult {
  valid: boolean;
  /** Descriptive reason the amount was rejected. Absent when `valid`. */
  error?: string;
  /**
   * The amount as a plain decimal string, safe to forward upstream.
   * Absent when the amount was rejected.
   */
  normalized?: string;
}

/** Plain decimal notation only — no sign, no exponent, no separators. */
const PLAIN_DECIMAL_RE = /^\d+(\.\d*)?$/;

function invalid(error: string): AmountValidationResult {
  return { valid: false, error };
}

/**
 * Convert a validated plain decimal string to integer stroops so magnitude and
 * "greater than zero" can be checked exactly, without floating-point rounding.
 */
function toStroops(plain: string, decimals: number): bigint {
  const dot = plain.indexOf(".");
  const intPart = dot === -1 ? plain : plain.slice(0, dot);
  const fracPart = dot === -1 ? "" : plain.slice(dot + 1);
  const scale = 10n ** BigInt(decimals);
  const frac = fracPart.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(intPart) * scale + BigInt(frac || "0");
}

/**
 * Validate an expense amount before any processing.
 *
 * An amount is valid when it is a plain-decimal, strictly positive value with
 * no more decimal places than the asset allows, and within Stellar's int64
 * stroop range. Everything else — negatives, zero, `null`, `undefined`,
 * booleans, objects, `NaN`, `Infinity`, exponential notation, thousands
 * separators, currency symbols — is rejected with a specific reason.
 *
 * @param amount     raw value from the request body; may be any type
 * @param assetCode  asset the amount is denominated in; controls precision
 *
 * @example
 *   validateExpenseAmount("12.5")            // { valid: true, normalized: "12.5" }
 *   validateExpenseAmount("-1")              // { valid: false, error: "..." }
 *   validateExpenseAmount("0.00000001")      // { valid: false, error: "..." } (8 dp)
 */
export function validateExpenseAmount(
  amount: unknown,
  assetCode?: string | null
): AmountValidationResult {
  const decimals = decimalsForAsset(assetCode);

  let raw: string;
  if (typeof amount === "string") {
    raw = amount.trim();
  } else if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      return invalid("Amount must be a finite number");
    }
    // `toFixed` keeps small values out of exponential notation, which the
    // plain-decimal check below would otherwise reject. Values >= 1e21 still
    // come back exponential and are rejected there, as intended.
    const fixed = amount.toFixed(decimals);
    raw = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  } else if (typeof amount === "bigint") {
    raw = amount.toString();
  } else {
    return invalid("Amount is required and must be a number or decimal string");
  }

  if (raw === "") {
    return invalid("Amount is required");
  }

  if (!PLAIN_DECIMAL_RE.test(raw)) {
    return invalid(
      "Amount must be a positive decimal number without signs, separators, or exponents"
    );
  }

  // Drop a trailing "." so "10." forwards upstream as "10".
  const plain = raw.endsWith(".") ? raw.slice(0, -1) : raw;

  const dot = plain.indexOf(".");
  if (dot !== -1 && plain.length - dot - 1 > decimals) {
    return invalid(
      `Amount must have at most ${decimals} decimal place${
        decimals === 1 ? "" : "s"
      }`
    );
  }

  const stroops = toStroops(plain, decimals);
  if (stroops <= 0n) {
    return invalid("Amount must be greater than zero");
  }
  if (stroops > MAX_STROOPS) {
    return invalid("Amount exceeds the maximum supported by Stellar");
  }

  return { valid: true, normalized: plain };
}
