/**
 * Shared presentation rules for Stellar asset amounts.
 *
 * This module is the single source of truth for *how an amount looks*.
 * It never touches the values sent to the API: `src/lib/money.ts` still
 * owns parsing, validation and normalisation of the raw decimal strings
 * that go on the wire, and callers keep passing those raw strings to
 * `api.*`. Everything here is display-only.
 *
 * Rules (see the PR for the rationale):
 *
 *  - Amounts are read as exact decimal strings, never through
 *    `parseFloat`, so `"0.1"` + `"0.2"` style artifacts cannot appear and
 *    a 7-decimal value survives intact.
 *  - Values are rounded half-away-from-zero to {@link AMOUNT_MAX_DECIMALS}
 *    (7 dp = 1 stroop, the smallest amount Stellar can represent), then
 *    padded/trimmed to at least {@link AMOUNT_MIN_DECIMALS} so equivalent
 *    values render identically: `"1.5"`, `"1.50"` and `"1.5000000"` all
 *    become `1.50`.
 *  - Significant digits are never dropped: a sub-cent value such as
 *    `"0.0000001"` keeps all seven decimals rather than rounding to
 *    `0.00`.
 *  - Invalid or absent input renders {@link AMOUNT_UNAVAILABLE} — never a
 *    fabricated `0`, which would read as "you are square".
 *
 * Grouping separators come from `Intl`, but the locale is pinned by
 * default (see {@link DEFAULT_AMOUNT_LOCALE}) because these components
 * render on the server and in the browser: a runtime-derived locale would
 * produce a hydration mismatch. Only the separators are localised — the
 * digits and the asset code are not, so the meaning of the amount cannot
 * change with the locale.
 */

/** Smallest unit Stellar can represent: 1 stroop = 10^-7. */
export const AMOUNT_MAX_DECIMALS = 7;

/** Minimum decimals shown, so equivalent values line up in a column. */
export const AMOUNT_MIN_DECIMALS = 2;

/** Rendered in place of an amount we cannot interpret or do not have. */
export const AMOUNT_UNAVAILABLE = "—";

/** Spoken in place of an amount we cannot interpret or do not have. */
export const AMOUNT_UNAVAILABLE_LABEL = "Amount unavailable";

/** Spoken when an amount arrives without an asset code. */
export const UNKNOWN_ASSET_LABEL = "unknown asset";

/**
 * Locale used for grouping/decimal separators. Pinned so server and
 * client render the same string; pass `locale` to override per call.
 */
export const DEFAULT_AMOUNT_LOCALE = "en-US";

export interface FormatAmountOptions {
  /** BCP-47 locale for separators. Defaults to {@link DEFAULT_AMOUNT_LOCALE}. */
  locale?: string;
  /** Minimum decimals. Defaults to {@link AMOUNT_MIN_DECIMALS}. */
  minDecimals?: number;
  /** Maximum decimals. Defaults to {@link AMOUNT_MAX_DECIMALS}. */
  maxDecimals?: number;
  /** `"always"` prefixes a `+` on positive, non-zero amounts. */
  signDisplay?: "auto" | "always";
}

export interface FormattedAmount {
  /** Digits only, with separators applied — e.g. `"1,234.50"`. */
  amount: string;
  /** Normalised asset code, or `null` when none was supplied. */
  asset: string | null;
  /** What to show on screen — e.g. `"1,234.50 USDC"`. */
  text: string;
  /** What assistive technology should announce. Always names the asset. */
  label: string;
  /** `false` when the input could not be read as a number. */
  valid: boolean;
}

interface Decimal {
  negative: boolean;
  /** Integer digits, no sign, no separators. Always at least `"0"`. */
  int: string;
  /** Fractional digits, no trailing-zero guarantees. May be empty. */
  frac: string;
}

/**
 * Expand exponential notation (`"1e-7"`, `"1.5E+21"`) into a plain
 * decimal string. Returns `null` when `raw` is not exponential.
 */
function expandExponential(raw: string): string | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(raw);
  if (!match) return null;

  const [, sign, intPart, fracPart = "", expPart] = match;
  const exponent = Number.parseInt(expPart, 10);
  const digits = intPart + fracPart;
  const point = intPart.length + exponent;

  let plain: string;
  if (point <= 0) plain = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) plain = digits + "0".repeat(point - digits.length);
  else plain = `${digits.slice(0, point)}.${digits.slice(point)}`;

  return sign === "-" ? `-${plain}` : plain;
}

/**
 * Read a raw amount into exact decimal digits.
 *
 * Accepts the decimal strings used by the API contract (`Expense.amount`,
 * `MemberBalance.net`, `TreasuryBalance.balance`, …) as well as numbers
 * and exponential notation. Returns `null` for anything else — including
 * `NaN`, `Infinity`, empty strings and `null`/`undefined`.
 */
export function parseDecimalDigits(
  value: string | number | null | undefined
): Decimal | null {
  let raw: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    raw = String(value);
  } else if (typeof value === "string") {
    raw = value.trim();
  } else {
    return null;
  }
  if (!raw) return null;

  if (/[eE]/.test(raw)) {
    const expanded = expandExponential(raw);
    if (expanded === null) return null;
    raw = expanded;
  }

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match) return null;

  const int = match[2] ?? "";
  const frac = match[3] ?? "";
  // `"."`, `"-"` and `""` all reach here with no digits at all.
  if (!int && !frac) return null;

  return { negative: match[1] === "-", int: int || "0", frac };
}

/** Round to `places` decimals, half away from zero, using exact integer math. */
function roundDecimal(value: Decimal, places: number): Decimal {
  if (value.frac.length <= places) {
    return { ...value, frac: value.frac.padEnd(places, "0") };
  }

  const kept = value.frac.slice(0, places);
  const nextDigit = value.frac.charCodeAt(places) - 48;
  let scaled = BigInt(`${value.int}${kept}`);
  if (nextDigit >= 5) scaled += 1n;

  const digits = scaled.toString().padStart(places + 1, "0");
  const cut = digits.length - places;
  return {
    negative: value.negative,
    int: digits.slice(0, cut),
    frac: places === 0 ? "" : digits.slice(cut),
  };
}

/** Insert the locale's group separator every three integer digits. */
function groupInteger(int: string, separator: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

const separatorCache = new Map<string, { group: string; decimal: string }>();

function localeSeparators(locale: string): { group: string; decimal: string } {
  const cached = separatorCache.get(locale);
  if (cached) return cached;

  let separators = { group: ",", decimal: "." };
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    separators = {
      group: parts.find((p) => p.type === "group")?.value ?? ",",
      decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    };
  } catch {
    // Unknown locale — fall back to the pinned defaults above.
  }
  separatorCache.set(locale, separators);
  return separators;
}

/** Normalise an asset code for display, or `null` when there isn't one. */
export function normalizeAssetCode(
  assetCode: string | null | undefined
): string | null {
  if (typeof assetCode !== "string") return null;
  const trimmed = assetCode.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

/**
 * Whether the caller expected an asset code but didn't have one.
 *
 * Omitting `assetCode` entirely means "this figure is deliberately
 * asset-less" (a percentage, a locally computed subtotal). Passing
 * `null`/`""` means the data should have carried an asset and did not —
 * assistive technology is told so instead of hearing a bare number.
 */
function isAssetMissing(assetCode: string | null | undefined): boolean {
  return assetCode !== undefined && normalizeAssetCode(assetCode) === null;
}

/**
 * Format a raw amount for display alongside its asset.
 *
 * The returned `text` is what goes on screen and `label` is what screen
 * readers announce — they differ only when the amount is unavailable or
 * the asset is unknown, where the visual fallback is a glyph but the
 * spoken form has to be a sentence.
 *
 * @example
 *   formatAssetAmount("1.5", "XLM").text        // "1.50 XLM"
 *   formatAssetAmount("0.0000001", "XLM").text  // "0.0000001 XLM"
 *   formatAssetAmount("abc", "USDC").text       // "—"
 */
export function formatAssetAmount(
  value: string | number | null | undefined,
  assetCode?: string | null,
  options: FormatAmountOptions = {}
): FormattedAmount {
  const asset = normalizeAssetCode(assetCode);
  const assetMissing = isAssetMissing(assetCode);
  const parsed = parseDecimalDigits(value);

  if (!parsed) {
    return {
      amount: AMOUNT_UNAVAILABLE,
      asset,
      text: AMOUNT_UNAVAILABLE,
      label: asset
        ? `${AMOUNT_UNAVAILABLE_LABEL} (${asset})`
        : AMOUNT_UNAVAILABLE_LABEL,
      valid: false,
    };
  }

  const maxDecimals = clampDecimals(options.maxDecimals ?? AMOUNT_MAX_DECIMALS);
  const minDecimals = Math.min(
    clampDecimals(options.minDecimals ?? AMOUNT_MIN_DECIMALS),
    maxDecimals
  );
  const { group, decimal } = localeSeparators(
    options.locale ?? DEFAULT_AMOUNT_LOCALE
  );

  const rounded = roundDecimal(parsed, maxDecimals);
  const int = rounded.int.replace(/^0+(?=\d)/, "");
  let frac = rounded.frac.replace(/0+$/, "");
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, "0");

  const isZero = int === "0" && !/[1-9]/.test(frac);
  // Rounding can land on zero (`"-0.0000000004"`); never show `-0.00`.
  const negative = rounded.negative && !isZero;
  const sign = negative ? "-" : options.signDisplay === "always" && !isZero ? "+" : "";

  const amount = `${sign}${groupInteger(int, group)}${frac ? `${decimal}${frac}` : ""}`;
  const text = asset ? `${amount} ${asset}` : amount;
  const label = asset
    ? `${amount} ${asset}`
    : assetMissing
      ? `${amount} ${UNKNOWN_ASSET_LABEL}`
      : amount;

  return { amount, asset, text, label, valid: true };
}

function clampDecimals(places: number): number {
  if (!Number.isFinite(places)) return AMOUNT_MAX_DECIMALS;
  return Math.min(Math.max(Math.trunc(places), 0), AMOUNT_MAX_DECIMALS);
}

/**
 * Exact signed stroop value of a raw amount, or `null` when it cannot be
 * read. Use this to compare or aggregate amounts — it is integer maths on
 * the same 7-decimal grid the network uses, so it never accumulates the
 * drift that `parseFloat` addition would.
 *
 * This is a read-only view of the value: callers still send the original
 * string to the API.
 */
export function amountToStroops(
  value: string | number | null | undefined
): bigint | null {
  const parsed = parseDecimalDigits(value);
  if (!parsed) return null;

  const rounded = roundDecimal(parsed, AMOUNT_MAX_DECIMALS);
  const magnitude = BigInt(`${rounded.int}${rounded.frac}`);
  return rounded.negative ? -magnitude : magnitude;
}

/** Convenience wrapper for call sites that only need the visible string. */
export function formatAssetAmountText(
  value: string | number | null | undefined,
  assetCode?: string | null,
  options: FormatAmountOptions = {}
): string {
  return formatAssetAmount(value, assetCode, options).text;
}
