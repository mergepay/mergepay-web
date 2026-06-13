import { formatDistanceToNow, format as formatDate } from "date-fns";

/** Truncate a Stellar public key: GBBD…FLA5 */
export function shortKey(key: string, chars = 4) {
  if (!key || key.length <= chars * 2 + 1) return key;
  return `${key.slice(0, chars)}…${key.slice(-chars)}`;
}

export function shortHash(hash: string, chars = 6) {
  return shortKey(hash, chars);
}

/** Format a decimal-string amount with up to 7 dp, trimming trailing zeros. */
export function formatAmount(amount: string | number, maxDp = 2): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (Number.isNaN(n)) return "0";
  const abs = Math.abs(n);
  const dp = abs !== 0 && abs < 0.01 ? 7 : maxDp;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dp,
  });
}

export function formatMoney(amount: string | number, assetCode: string) {
  return `${formatAmount(amount)} ${assetCode}`;
}

export function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function fullDate(iso: string) {
  try {
    return formatDate(new Date(iso), "MMM d, yyyy · h:mm a");
  } catch {
    return iso;
  }
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
