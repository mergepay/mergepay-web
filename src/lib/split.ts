/**
 * Pure helpers for proportional expense splits (issue #25).
 *
 * Goal: for any valid input, the returned amounts are integers that sum
 * exactly to the requested total. We achieve this with Hamilton's
 * largest-remainder method: each share gets `floor(total * weight / sum(weights))`,
 * and the leftover integer units are distributed one-by-one to the shares
 * with the largest fractional remainder. Ties on fractional remainder go to
 * the member with the lower index (the "first member" rule), guaranteeing
 * determinism for equal remainders.
 *
 * Helpers re-exported here:
 *  - `toStroops` / `fromStroops` — decimal-7 ↔ integer-stroops conversion.
 *    These used to be inlined in `src/lib/bulkSettle.ts`; once `split.ts`
 *    lands on main, neighbours can re-import the canonical version. Both
 *    forms stay byte-identical (decimal-7 output, "throw on garbage").
 *  - `roundRobinRemainder` — the lower-level round-robin utility called
 *    out by the issue's implementation guidance. Useful when callers
 *    already have an integer baseline and just need to push the leftover
 *    onto it deterministically.
 *
 * Kept dependency-free (no React, no network) so each rule can be
 * exercised by Vitest in isolation.
 */

// ---------------------------------------------------------------------------
// Decimal-7 ↔ stroops (BigInt) helpers
// 1 XLM = 10,000,000 stroops. We always carry 7 decimal places on the wire.
// We avoid BigInt literal syntax (...n) so the source compiles against
// tsconfigs targeting ES2019 and below.
// ---------------------------------------------------------------------------

export const STROOPS_PER_UNIT = BigInt("10000000");
/** Internal scale for converting floating-point weights into BigInt-safe
 *  integers before the multiply/divide. 6 decimals of weight precision is
 *  enough for percent splits to two decimals plus any rounding slack. */
const WEIGHT_SCALE = 1_000_000;

/**
 * Convert a decimal amount (string or number) to integer stroops (BigInt),
 * so we can do exact comparisons without floating-point rounding.
 *
 * @example
 *   toStroops("1.5")       // → 15000000n
 *   toStroops("0.0000001") // → 1n
 */
export function toStroops(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toFixed(7) : amount;
  const trimmed = s.trim();
  if (!trimmed) {
    throw new Error(`toStroops: empty amount`);
  }
  // Tolerate a trailing dot ("50.") by padding one zero before splitting.
  const normalized = trimmed.endsWith(".") ? `${trimmed}0` : trimmed;
  // Default int to "0" so a leading dot (".5") parses as 0.5 stroops; let
  // BigInt("-") and other garbage throw so upstream callers surface bad
  // input instead of silently getting wrong totals.
  const [int = "0", frac = ""] = normalized.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return BigInt(int) * STROOPS_PER_UNIT + BigInt(padded);
}

/**
 * Inverse of `toStroops`. Always returns 7-decimal precision (matches the
 * API contract in `src/lib/types.ts`: "Decimal string, e.g. '42.5000000'").
 * Negative inputs render with a leading "-".
 */
export function fromStroops(amount: bigint): string {
  if (typeof amount !== "bigint") {
    throw new Error("fromStroops: bigint required");
  }
  const negative = amount < BigInt(0);
  const abs = negative ? -amount : amount;
  const intPart = abs / STROOPS_PER_UNIT;
  const fracPart = abs % STROOPS_PER_UNIT;
  const fracStr = fracPart.toString().padStart(7, "0");
  return `${negative ? "-" : ""}${intPart}.${fracStr}`;
}

// ---------------------------------------------------------------------------
// Largest-remainder split (Hamilton's method)
// ---------------------------------------------------------------------------

/**
 * Distribute `total` stroops (BigInt) across `weights` (relative numbers)
 * such that the returned `amounts` are integers summing EXACTLY to `total`.
 *
 * Algorithm (Hamilton's largest-remainder method):
 *  1. Scale each weight to an integer (`weight × 1e6`) so BigInt divides
 *     carry no fractional drift.
 *  2. Compute `floor = (total × scaledWeight) / sumScaledWeights` for each i.
 *  3. Compute `fraction = (total × scaledWeight) mod sumScaledWeights`.
 *  4. The leftover `total − Σ floor` is distributed one unit at a time to
 *     indices with the highest `fraction`; ties go to the lower index.
 *
 * @example
 *   computeSharesAmounts(100n, [1, 1, 1])       // → [34n, 33n, 33n]
 *   computeSharesAmounts(100n, [33.33, 33.33, 33.34])
 *                                                 // → [33n, 33n, 34n]
 *   computeSharesAmounts(1n,   [1, 1])         // → [1n, 0n]
 *   computeSharesAmounts(0n,   [1, 2])         // → [0n, 0n]
 */
export function computeSharesAmounts(
  total: bigint,
  weights: number[]
): bigint[] {
  if (typeof total !== "bigint") {
    throw new Error("computeSharesAmounts: total must be bigint");
  }
  if (!Array.isArray(weights)) {
    throw new Error("computeSharesAmounts: weights must be array");
  }
  if (weights.length === 0) return [];
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(
        `computeSharesAmounts: weight[${i}] must be a finite non-negative number; got ${
          String(w)
        }`
      );
    }
  }
  if (total < BigInt(0)) {
    throw new Error("computeSharesAmounts: total must be non-negative");
  }
  if (total === BigInt(0)) return weights.map(() => BigInt(0));

  // Scale weights → integers so the BigInt divide can't drift.
  // WEIGHT_SCALE = 1_000_000 lets callers pass weights with up to 6
  // fractional digits (e.g. 33.333333). Multiplied values stay safely
  // within BigInt for any realistic Stellar amount.
  //
  // Numeric-boundary note: `Math.round(w * 1e6)` runs in Number space
  // before BigInt conversion. For w ≤ ~9e9 (covers all realistic Stellar
  // custom amounts and percentage splits — i.e. amount ≤ ~9B XLM or
  // percent 0..100) `w * 1e6` stays under Number.MAX_SAFE_INTEGER
  // (≈9.007e15). Above ~9e9 the multiply starts losing precision, so
  // call sites feeding absurdly large weights should pre-scale before
  // invoking this function.
  const scaled: bigint[] = weights.map((w) =>
    BigInt(Math.round(w * WEIGHT_SCALE))
  );
  const totalScaled: bigint = scaled.reduce((s, w) => s + w, BigInt(0));
  if (totalScaled === BigInt(0)) {
    throw new Error(
      "computeSharesAmounts: weights must sum to a positive number"
    );
  }

  // Step 2 + 3 — floor allocations and fractional remainders.
  const floor: bigint[] = scaled.map(
    (w) => (total * w) / totalScaled
  );
  const fractions: bigint[] = scaled.map(
    (w) => (total * w) % totalScaled
  );

  // Step 4 — distribute the leftover one stroop at a time.
  const allocated = floor.reduce((s, x) => s + x, BigInt(0));
  let remainder = total - allocated;
  if (remainder > BigInt(0)) {
    // Indices sorted by fraction descending; tiebreak by ascending index.
    const order = weights
      .map((_, i) => i)
      .sort((a, b) => {
        const diff = fractions[b] - fractions[a];
        if (diff !== BigInt(0)) {
          return diff > BigInt(0) ? 1 : -1;
        }
        return a - b;
      });
    let i = 0;
    while (remainder > BigInt(0)) {
      floor[order[i % order.length]] += BigInt(1);
      remainder -= BigInt(1);
      i += 1;
    }
  }

  return floor;
}

// ---------------------------------------------------------------------------
// Round-robin remainder (lower-level utility for non-largest-remainder cases)
// ---------------------------------------------------------------------------

/**
 * Mutate `amounts` by distributing `remainder` integer units one-by-one in
 * index order, wrapping back to 0 when `remainder > amounts.length`.
 *
 * Distinct from Hamilton's method: this gives every slot the same chance
 * (round-robin) rather than biasing toward the slots with the largest
 * fractional remainder. Useful when the caller has already accepted an
 * integer baseline and just needs to push the leftover onto it.
 *
 * Per the issue's implementation guidance (returns void per spec):
 *   "Add a utility function roundRobinRemainder(amounts: number[],
 *   remainder: number): void that distributes remainder one by one."
 */
export function roundRobinRemainder(
  amounts: number[],
  remainder: number
): void {
  if (!Array.isArray(amounts)) {
    throw new Error("roundRobinRemainder: amounts must be array");
  }
  if (!Number.isInteger(remainder) || remainder < 0) {
    throw new Error(
      "roundRobinRemainder: remainder must be a non-negative integer"
    );
  }
  if (remainder === 0 || amounts.length === 0) return;
  for (let i = 0; i < remainder; i++) {
    amounts[i % amounts.length] += 1;
  }
}
