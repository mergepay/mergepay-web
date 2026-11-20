/**
 * Recalculate group member balances from the expense and settlement records
 * already used by the client.
 *
 * Only unsettled expense shares contribute debt. Each share debits its owner
 * and credits the expense payer. Confirmed settlements move that balance from
 * the payer to the payee; pending and failed settlements do not move money.
 * Every calculation is isolated by both asset code and issuer.
 */

import { fromStroops, MAX_DECIMAL_PLACES } from "../money";
import type { Expense, Settlement, User } from "../types";

const STROOPS_PER_UNIT = 10_000_000n;
const STROOP_DECIMALS = MAX_DECIMAL_PLACES;

export interface AssetIdentity {
  assetCode: string;
  assetIssuer: string | null;
}

export interface RecalculatedBalance extends AssetIdentity {
  userId: string;
  user: User;
  /** Positive means the group owes this member; negative means they owe. */
  net: string;
  /** Exact net amount in the asset's smallest unit. */
  netStroops: bigint;
}

interface BalanceAccumulator extends AssetIdentity {
  userId: string;
  user: User;
  netStroops: bigint;
}

/**
 * Return a stable key for an asset. Stellar asset codes are case-sensitive;
 * the issuer is therefore part of the identity for every issued asset.
 * Native XLM always has a null issuer.
 */
export function assetIdentityKey(
  assetCode: string,
  assetIssuer?: string | null
): string {
  const issuer = assetCode === "XLM" ? null : assetIssuer ?? null;
  return issuer === null ? assetCode : JSON.stringify([assetCode, issuer]);
}

function parseStroops(value: string, label: string): bigint {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a decimal string.`);
  }

  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new TypeError(`${label} must be a plain decimal amount.`);
  }

  const [, sign, whole, fraction = ""] = match;
  const significantFraction = fraction.replace(/0+$/, "");
  if (significantFraction.length > STROOP_DECIMALS) {
    throw new RangeError(`${label} exceeds Stellar's ${STROOP_DECIMALS}-decimal precision.`);
  }
  // Digits beyond the supported precision are harmless only when they are
  // trailing zeroes, so dropping them does not round or change the value.
  const scaled =
    BigInt(whole) * STROOPS_PER_UNIT +
    BigInt(fraction.slice(0, STROOP_DECIMALS).padEnd(STROOP_DECIMALS, "0"));
  return sign === "-" && scaled !== 0n ? -scaled : scaled;
}

function assertAsset(assetCode: string, assetIssuer: string | null): AssetIdentity {
  if (
    typeof assetCode !== "string" ||
    assetCode.trim() === "" ||
    assetCode !== assetCode.trim()
  ) {
    throw new TypeError("Balance records must have a non-empty asset code.");
  }
  if (assetIssuer !== null && assetIssuer.trim() === "") {
    throw new TypeError(`Asset ${assetCode} has an empty issuer.`);
  }
  if (assetCode !== "XLM" && !assetIssuer) {
    throw new TypeError(`Issued asset ${assetCode} must include its issuer.`);
  }
  return {
    assetCode,
    assetIssuer: assetCode === "XLM" ? null : assetIssuer ?? null,
  };
}

function validateShareOwner(share: Expense["shares"][number]): void {
  if (!share.userId || share.user.id !== share.userId) {
    throw new TypeError(`Expense share ${share.id} has an inconsistent user identity.`);
  }
  if (share.status !== "pending" && share.status !== "settling" && share.status !== "settled") {
    throw new TypeError(`Expense share ${share.id} has an invalid status.`);
  }
}

/**
 * Recalculate signed net balances from complete expense and settlement
 * snapshots. Amounts are exact decimal strings in the Stellar 7-decimal
 * range. Malformed or unrepresentable amounts throw rather than being
 * silently skipped or rounded.
 */
export function recalculateGroupBalances(
  expenses: readonly Expense[],
  settlements: readonly Settlement[]
): RecalculatedBalance[] {
  const balances = new Map<string, BalanceAccumulator>();

  const add = (
    userId: string,
    user: User,
    asset: AssetIdentity,
    stroops: bigint
  ): void => {
    if (!userId || user.id !== userId) {
      throw new TypeError("Balance contributions must have a consistent user identity.");
    }
    const key = JSON.stringify([
      userId,
      assetIdentityKey(asset.assetCode, asset.assetIssuer),
    ]);
    const existing = balances.get(key);
    if (existing) {
      existing.netStroops += stroops;
    } else {
      balances.set(key, { ...asset, userId, user, netStroops: stroops });
    }
  };

  for (const expense of expenses) {
    const asset = assertAsset(expense.assetCode, expense.assetIssuer);
    if (!expense.payerUserId || expense.payer.id !== expense.payerUserId) {
      throw new TypeError(`Expense ${expense.id} has an inconsistent payer identity.`);
    }
    if (!Array.isArray(expense.shares)) {
      throw new TypeError(`Expense ${expense.id} must include its shares.`);
    }

    const total = parseStroops(expense.amount, `Expense ${expense.id} amount`);
    if (total < 0n) {
      throw new RangeError(`Expense ${expense.id} amount cannot be negative.`);
    }

    let shareTotal = 0n;
    for (const share of expense.shares) {
      validateShareOwner(share);
      const shareAmount = parseStroops(
        share.shareAmount,
        `Expense share ${share.id} amount`
      );
      if (shareAmount < 0n) {
        throw new RangeError(`Expense share ${share.id} amount cannot be negative.`);
      }
      shareTotal += shareAmount;
    }
    if (shareTotal !== total) {
      throw new RangeError(`Expense ${expense.id} shares do not sum to its total amount.`);
    }

    for (const share of expense.shares) {
      if (share.status === "settled" || share.userId === expense.payerUserId) continue;
      const shareAmount = parseStroops(
        share.shareAmount,
        `Expense share ${share.id} amount`
      );
      add(expense.payerUserId, expense.payer, asset, shareAmount);
      add(share.userId, share.user, asset, -shareAmount);
    }
  }

  for (const settlement of settlements) {
    if (
      settlement.status !== "pending" &&
      settlement.status !== "submitted" &&
      settlement.status !== "settling" &&
      settlement.status !== "confirmed" &&
      settlement.status !== "failed"
    ) {
      throw new TypeError(`Settlement ${settlement.id} has an invalid status.`);
    }
    if (
      !settlement.fromUserId || settlement.from.id !== settlement.fromUserId ||
      !settlement.toUserId || settlement.to.id !== settlement.toUserId ||
      settlement.fromUserId === settlement.toUserId
    ) {
      throw new TypeError(`Settlement ${settlement.id} has inconsistent participant identities.`);
    }

    const amount = parseStroops(settlement.amount, `Settlement ${settlement.id} amount`);
    if (amount < 0n) {
      throw new RangeError(`Settlement ${settlement.id} amount cannot be negative.`);
    }
    const asset = assertAsset(settlement.assetCode, settlement.assetIssuer);
    if (settlement.status !== "confirmed") continue;

    add(settlement.fromUserId, settlement.from, asset, amount);
    add(settlement.toUserId, settlement.to, asset, -amount);
  }

  return Array.from(balances.values())
    .map((balance) => ({
      ...balance,
      net: fromStroops(balance.netStroops),
    }))
    .sort(
      (left, right) =>
        left.assetCode.localeCompare(right.assetCode) ||
        (left.assetIssuer ?? "").localeCompare(right.assetIssuer ?? "") ||
        left.userId.localeCompare(right.userId)
    );
}
