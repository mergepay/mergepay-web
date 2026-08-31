import type { TreasuryBalance } from "./types";

/**
 * Pure aggregation helpers for the treasury widget (#392).
 *
 * The widget shows a *collective* view across every group the user belongs to
 * that has a treasury enabled. Whereas the treasury panel is per-group, this
 * module totals balances *by asset code* across all treasuries so a shared
 * "Treasury" headline is accurate: XLM and USDC are never summed together, and
 * a missing trustline (absent balance row) is treated as a zero rather than an
 * error.
 *
 * Everything here is pure and string-decimal-safe so it is trivially testable.
 */

/** A single treasury's fetched balances, tagged with its group for grouping. */
export interface TreasurySource {
  /** The id of the group owning this treasury. */
  groupId: string;
  /** The display name of the group. */
  groupName: string;
  /** The treasury account's balances (may be empty when unfunded). */
  balances: TreasuryBalance[];
}

/** A collective per-asset total across all enabled treasuries. */
export interface TreasuryAssetTotal {
  assetCode: string;
  assetIssuer: string | null;
  /** Total across every treasury, as a decimal string. */
  total: string;
  /** Number of treasuries that reported a nonzero balance for this asset. */
  fundedTreasuries: number;
  /** Total number of enabled treasuries being aggregated. */
  totalTreasuries: number;
}

/** The full aggregate computed by {@link aggregateTreasury}. */
export interface TreasuryAggregate {
  /** Per-asset totals, ordered by total descending. */
  assets: TreasuryAssetTotal[];
  /** Number of treasuries included in the aggregation. */
  treasuryCount: number;
  /** Every enabled treasury's balances, for per-group rendering. */
  sources: TreasurySource[];
  /** `true` when no treasury holds any funds yet. */
  allZero: boolean;
}

/** The zeros of `lhs/rhs` guard used when no balance amount parses. */
const DECIMAL_SCALE = 7;

/**
 * Sum two Stellar decimal strings (up to 7 decimal places, matching Horizon)
 * without floating-point drift. Returns the normalised sum.
 */
export function addDecimal(a: string, b: string): string {
  const sa = a || "0";
  const sb = b || "0";
  const [ia = "0", fa = ""] = sa.split(".");
  const [ib = "0", fb = ""] = sb.split(".");
  const scale = DECIMAL_SCALE;
  const aN = BigInt(ia + fa.padEnd(scale, "0"));
  const bN = BigInt(ib + fb.padEnd(scale, "0"));
  const sum = aN + bN;
  const str = sum.toString().padStart(scale + 1, "0");
  const int = str.slice(0, str.length - scale) || "0";
  const frac = str.slice(str.length - scale).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** Compare two decimal strings: -1, 0, or 1. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const sc = (v: string): bigint => {
    const [i = "0", f = ""] = (v || "0").split(".");
    const scale = DECIMAL_SCALE;
    return BigInt(i) * 10n ** BigInt(scale) + BigInt(f.padEnd(scale, "0"));
  };
  const aN = sc(a);
  const bN = sc(b);
  if (aN < bN) return -1;
  if (aN > bN) return 1;
  return 0;
}

/**
 * Aggregate treasury balances across multiple groups, grouped and summed by
 * asset code. Zero balances and missing trustlines are handled gracefully:
 * an asset that no treasury holds simply never appears in `assets`.
 */
export function aggregateTreasury(sources: TreasurySource[]): TreasuryAggregate {
  const byAsset = new Map<
    string,
    {
      code: string;
      issuer: string | null;
      total: string;
      funded: number;
    }
  >();

  for (const source of sources) {
    for (const bal of source.balances) {
      const amount = bal.balance ?? "0";
      if (compareDecimal(amount, "0") === 0) continue; // skip zero rows
      const key = `${bal.assetCode}:${bal.assetIssuer ?? ""}`;
      const existing = byAsset.get(key);
      if (existing) {
        existing.total = addDecimal(existing.total, amount);
        existing.funded += 1;
      } else {
        byAsset.set(key, {
          code: bal.assetCode,
          issuer: bal.assetIssuer,
          total: amount,
          funded: 1,
        });
      }
    }
  }

  const totalTreasuries = sources.length;
  const assets: TreasuryAssetTotal[] = [...byAsset.values()]
    .map((a) => ({
      assetCode: a.code,
      assetIssuer: a.issuer,
      total: a.total,
      fundedTreasuries: a.funded,
      totalTreasuries,
    }))
    // Bigger totals first so the lead asset reads correctly.
    .sort((x, y) => compareDecimal(y.total, x.total));

  return {
    assets,
    treasuryCount: totalTreasuries,
    sources,
    allZero: assets.length === 0,
  };
}

/** Whether at least one enabled treasury exists to aggregate. */
export function hasEnabledTreasuries(sources: TreasurySource[]): boolean {
  return sources.length > 0;
}