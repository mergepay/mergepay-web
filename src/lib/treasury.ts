import type { TreasuryBalance, TrustlineAsset, TreasuryTransaction } from "./types";

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

// ---------------------------------------------------------------------------
// Member contributions (#376)
// ---------------------------------------------------------------------------

/**
 * Subtract two decimal strings exactly (`a - b`), returning a plain decimal
 * string with trailing fractional zeros removed. Unlike {@link addDecimal}
 * this understands a leading minus, so a net contribution can go negative
 * when a member has withdrawn more than they put in.
 */
export function subtractDecimal(a: string, b: string): string {
  const scaled = (value: string): bigint => {
    const raw = (value || "0").trim();
    const negative = raw.startsWith("-");
    const body = negative ? raw.slice(1) : raw;
    const [i = "0", f = ""] = body.split(".");
    const magnitude =
      BigInt(i || "0") * 10n ** BigInt(DECIMAL_SCALE) +
      BigInt(f.padEnd(DECIMAL_SCALE, "0") || "0");
    return negative ? -magnitude : magnitude;
  };

  const diff = scaled(a) - scaled(b);
  const negative = diff < 0n;
  const abs = negative ? -diff : diff;
  const str = abs.toString().padStart(DECIMAL_SCALE + 1, "0");
  const int = str.slice(0, str.length - DECIMAL_SCALE) || "0";
  const frac = str.slice(str.length - DECIMAL_SCALE).replace(/0+$/, "");
  const plain = frac ? `${int}.${frac}` : int;
  return negative ? `-${plain}` : plain;
}

/** One member's net movement of a single asset through the treasury. */
export interface MemberAssetContribution {
  assetCode: string;
  assetIssuer: string | null;
  /** Confirmed deposits, as a decimal string. */
  deposited: string;
  /** Confirmed withdrawals, as a decimal string. */
  withdrawn: string;
  /** `deposited - withdrawn`; negative when they took out more than they put in. */
  net: string;
}

/** A group member's confirmed treasury activity, aggregated per asset. */
export interface MemberContribution {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  /** Public key, for the avatar's deterministic colour. */
  stellarPublicKey: string;
  /** One row per asset the member moved, largest net first. */
  assets: MemberAssetContribution[];
  /** Confirmed transactions this member authored. */
  transactionCount: number;
}

/**
 * Whether a treasury transaction is settled enough to count toward totals.
 * A deposit or withdrawal that is still pending, awaiting signatures, merely
 * submitted, or failed is excluded so member totals never overstate funds.
 */
export function isConfirmedTreasuryTx(tx: TreasuryTransaction): boolean {
  return tx?.status === "confirmed";
}

// ---------------------------------------------------------------------------
// Wallet-side multi-asset trustline summary (#344)
// ---------------------------------------------------------------------------

/**
 * One configured asset's wallet-side row: its balance, conversion rates, and
 * whether the account can actually hold it.
 */
export interface WalletAssetSummary {
  /** Asset code, e.g. `"XLM"` or `"USDC"`. */
  assetCode: string;
  /** Issuer public key, or `null` for native XLM. */
  assetIssuer: string | null;
  /** Balance as a decimal string exactly as Horizon reported it. */
  balance: string;
  /** Direct fiat price of one unit (XLM→USD, USDC→USD), when known. */
  fiatRate: number | null;
  /** Cross-asset rate: how much of `otherAssetCode` one unit converts to. */
  crossRate: number | null;
  /** The other configured asset this row converts into. */
  otherAssetCode: string | null;
  /** `true` once the account holds an active trustline for the asset. */
  hasTrustline: boolean;
}

/**
 * Build the wallet-side per-asset rows the treasury balance widget renders.
 *
 * Two conversion figures ride along with each asset: its direct fiat price
 * (`fiatRate`) and the cross rate into the *other* configured asset
 * (`crossRate`, e.g. 1 XLM → `N` USDC derived from the shared fiat feed).
 * Both are `null` when the feed has not answered, so the widget renders no
 * estimate rather than a guessed one. Rows keep the caller's order.
 *
 * Pure and dependency-free so it is trivially unit-testable.
 */
export function buildWalletAssetSummaries(
  assets: readonly TrustlineAsset[] | null | undefined,
  fiatRates: Record<string, number | null | undefined> = {}
): WalletAssetSummary[] {
  const rows = (assets ?? []).map((asset) => ({
    assetCode: asset.code,
    assetIssuer: asset.issuer ?? null,
    balance: asset.balance ?? "0",
    hasTrustline: asset.hasTrustline !== false,
  }));

  return rows.map((row) => {
    const fiatRate = fiatRates[row.assetCode];
    const other = rows.find((candidate) => candidate.assetCode !== row.assetCode);
    const otherRate = other ? fiatRates[other.assetCode] : undefined;

    // 1 unit of this asset → `fiatRate / otherRate` units of the other.
    const crossRate =
      typeof fiatRate === "number" &&
      Number.isFinite(fiatRate) &&
      fiatRate > 0 &&
      typeof otherRate === "number" &&
      Number.isFinite(otherRate) &&
      otherRate > 0
        ? fiatRate / otherRate
        : null;

    return {
      ...row,
      // A zero or non-finite price is "the feed has no answer", not "free" —
      // displaying $0.00 for a holding would read as a real valuation.
      fiatRate:
        typeof fiatRate === "number" && Number.isFinite(fiatRate) && fiatRate > 0
          ? fiatRate
          : null,
      crossRate,
      otherAssetCode: other ? other.assetCode : null,
    };
  });
}

/**
 * Aggregate a treasury's transaction history into per-member, per-asset
 * contributions — the "who funded the shared pot" view.
 *
 * Only confirmed transactions with a positive amount and a known author are
 * counted. Member rows are ordered by transaction count (most active first),
 * then name; assets within a row by net contribution descending. Pure, so it
 * is trivially unit-testable.
 */
export function aggregateMemberContributions(
  transactions: readonly TreasuryTransaction[] = []
): MemberContribution[] {
  const byUser = new Map<
    string,
    {
      userId: string;
      userName: string;
      avatarUrl: string | null;
      stellarPublicKey: string;
      count: number;
      assets: Map<
        string,
        { code: string; issuer: string | null; deposited: string; withdrawn: string }
      >;
    }
  >();

  for (const tx of transactions ?? []) {
    if (!tx || !tx.userId) continue;
    if (!isConfirmedTreasuryTx(tx)) continue;
    const amount = tx.amount ?? "0";
    if (compareDecimal(amount, "0") <= 0) continue;

    const entry = byUser.get(tx.userId) ?? {
      userId: tx.userId,
      userName: tx.user?.displayName ?? "Unknown member",
      avatarUrl: tx.user?.avatarUrl ?? null,
      stellarPublicKey: tx.user?.stellarPublicKey ?? tx.userId,
      count: 0,
      assets: new Map(),
    };
    entry.count += 1;
    // Prefer a real display name / key once one shows up in the history.
    if (tx.user?.displayName) entry.userName = tx.user.displayName;
    if (tx.user?.stellarPublicKey) entry.stellarPublicKey = tx.user.stellarPublicKey;
    if (tx.user?.avatarUrl) entry.avatarUrl = tx.user.avatarUrl;

    const key = `${tx.assetCode}:${tx.assetIssuer ?? ""}`;
    const asset = entry.assets.get(key) ?? {
      code: tx.assetCode,
      issuer: tx.assetIssuer ?? null,
      deposited: "0",
      withdrawn: "0",
    };
    if (tx.direction === "withdrawal") {
      asset.withdrawn = addDecimal(asset.withdrawn, amount);
    } else {
      asset.deposited = addDecimal(asset.deposited, amount);
    }
    entry.assets.set(key, asset);
    byUser.set(tx.userId, entry);
  }

  return [...byUser.values()]
    .map((entry) => ({
      userId: entry.userId,
      userName: entry.userName,
      avatarUrl: entry.avatarUrl,
      stellarPublicKey: entry.stellarPublicKey,
      transactionCount: entry.count,
      assets: [...entry.assets.values()]
        .map((a) => ({
          assetCode: a.code,
          assetIssuer: a.issuer,
          deposited: a.deposited,
          withdrawn: a.withdrawn,
          net: subtractDecimal(a.deposited, a.withdrawn),
        }))
        .sort((x, y) => compareDecimal(y.net, x.net)),
    }))
    .sort(
      (a, b) =>
        b.transactionCount - a.transactionCount ||
        a.userName.localeCompare(b.userName)
    );
}