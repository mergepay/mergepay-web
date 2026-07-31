import {
  formatAssetAmount,
  formatAssetAmountText,
  type FormatAmountOptions,
} from "./currency";
import {
  formatRelativeTimestamp,
  formatTimestamp,
  formatTimestampFull,
} from "./datetime";

/** Truncate a Stellar public key: GBBD…FLA5 */
export function shortKey(key: string, chars = 4) {
  if (!key || key.length <= chars * 2 + 1) return key;
  return `${key.slice(0, chars)}…${key.slice(-chars)}`;
}

export function shortHash(hash: string, chars = 6) {
  return shortKey(hash, chars);
}

/**
 * Format a decimal-string amount without an asset code.
 *
 * Presentation rules live in `src/lib/currency.ts` — this is a thin
 * wrapper for the few call sites that render the asset separately.
 * Prefer {@link formatMoney} (or the `Money` / `NetAmount` components)
 * so the asset is never dropped from the output.
 */
export function formatAmount(
  amount: string | number | null | undefined,
  options?: FormatAmountOptions
): string {
  return formatAssetAmount(amount, undefined, options).amount;
}

/** Format an amount together with its asset code, e.g. `"1,234.50 USDC"`. */
export function formatMoney(
  amount: string | number | null | undefined,
  assetCode: string | null | undefined,
  options?: FormatAmountOptions
) {
  return formatAssetAmountText(amount, assetCode, options);
}

/**
 * Date helpers are thin wrappers over the shared formatters in
 * `src/lib/datetime.ts`, which own timestamp parsing (offsets, date-only
 * values, invalid input). Prefer the `Timestamp` component where the
 * exact time should also be exposed to assistive technology.
 */
export function timeAgo(iso: string | null | undefined) {
  return formatRelativeTimestamp(iso);
}

export function fullDate(iso: string | null | undefined) {
  return formatTimestamp(iso);
}

export function fullDateLabel(iso: string | null | undefined) {
  return formatTimestampFull(iso);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Deterministic brand color for a user, derived from their public key. */
const AVATAR_COLORS = [
  "#6C4DF6",
  "#FF8A3C",
  "#FF5D8F",
  "#3DD6C3",
  "#B5DB1F",
  "#FFE45C",
];

export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
