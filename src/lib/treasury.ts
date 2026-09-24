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

// ---------------------------------------------------------------------------
// Per-treasury distribution (#367)
// ---------------------------------------------------------------------------

/** One asset's slice of a treasury overview. */
export interface TreasuryAssetSlice {
  assetCode: string;
  assetIssuer: string | null;
  /** Decimal string exactly as the API reported it. */
  balance: string;
  /** Numeric balance, floored at 0 (`NaN` becomes 0). */
  amount: number;
  /**
   * The metric the slice was weighted by — fiat value when a rate is known,
   * raw units otherwise (see {@link TreasuryDistribution.basis}).
   */
  value: number;
  /** Share of the treasury, 0–100, one decimal place. */
  percent: number;
  /** `false` when the trustline is missing or the balance is zero. */
  established: boolean;
}

export interface TreasuryDistribution {
  assets: TreasuryAssetSlice[];
  /** Sum of every slice's `value`. */
  totalValue: number;
  /**
   * How `percent` was derived:
   *  - `"value"`    — fiat weights (rates available for every holding),
   *  - `"relative"` — each balance scaled against the largest holding,
   *                   used when no fiat rate is known,
   *  - `"none"`     — nothing to show (all balances zero/missing).
   */
  basis: "value" | "relative" | "none";
  /** `true` when no asset holds anything (or nothing is reported at all). */
  allZero: boolean;
}

/** Round to one decimal place without float noise. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Build the asset distribution shown by `TreasuryOverview`.
 *
 * XLM and USDC are different units, so a percentage split only makes sense
 * once they share a common measure. Callers pass `valueOf` (typically the
 * fiat converter from `useCurrencyRates`); when no rate is available the
 * split degrades to a relative scale against the largest holding rather than
 * summing incomparable units — and when everything is zero we report
 * `"none"` so the UI can show its empty-state banner instead of an empty
 * chart.
 *
 * Pure and dependency-free so it can be unit-tested without React.
 *
 * `expectedCodes` lists the assets the treasury *should* hold (the group's
 * settlement assets). Any of them that the API did not report is injected as
 * a zero slice so the overview can surface a missing trustline instead of
 * silently dropping the asset from the chart.
 */
export function buildTreasuryDistribution(
  balances: TreasuryBalance[] = [],
  valueOf: (amount: string, assetCode: string) => number = () => 0,
  expectedCodes: readonly string[] = []
): TreasuryDistribution {
  const reported = (balances ?? []).filter(
    (b): b is TreasuryBalance => Boolean(b) && typeof b.assetCode === "string"
  );

  const present = new Set(reported.map((b) => b.assetCode.toUpperCase()));
  const rows: TreasuryBalance[] = [
    ...reported,
    ...expectedCodes
      .filter((code) => !present.has(code.trim().toUpperCase()))
      .map<TreasuryBalance>((code) => ({
        assetCode: code.trim(),
        assetIssuer: null,
        balance: "0",
      })),
  ];

  const parsed = rows.map((row) => {
    const amount = Math.max(0, parseFloat(row.balance) || 0);
    const rawValue = valueOf(row.balance ?? "0", row.assetCode);
    const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
    return { row, amount, value };
  });

  const totalValue = parsed.reduce((sum, r) => sum + r.value, 0);
  const maxAmount = parsed.reduce((max, r) => Math.max(max, r.amount), 0);
  const basis: TreasuryDistribution["basis"] =
    totalValue > 0 ? "value" : maxAmount > 0 ? "relative" : "none";

  const assets: TreasuryAssetSlice[] = parsed
    .map(({ row, amount, value }) => ({
      assetCode: row.assetCode,
      assetIssuer: row.assetIssuer ?? null,
      balance: row.balance ?? "0",
      amount,
      value,
      percent:
        basis === "value"
          ? round1((value / totalValue) * 100)
          : basis === "relative"
            ? round1((amount / maxAmount) * 100)
            : 0,
      established: amount > 0,
    }))
    .sort((a, b) => b.percent - a.percent || b.amount - a.amount);

  return {
    assets,
    totalValue,
    basis,
    allZero: basis === "none",
  };
}

/**
 * The asset codes a treasury is expected to hold, split into "funded" and
 * "not established" buckets so the overview can call out a missing trustline
 * instead of silently omitting the asset.
 */
export function splitTrustlineState(
  expected: readonly string[],
  balances: TreasuryBalance[]
): { funded: string[]; missing: string[] } {
  const funded = new Set<string>();
  for (const b of balances ?? []) {
    if (b && parseFloat(b.balance || "0") > 0) funded.add(b.assetCode);
  }
  const missing = expected.filter((code) => !funded.has(code));
  return { funded: expected.filter((code) => funded.has(code)), missing };
}