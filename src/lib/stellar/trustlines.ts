/**
 * Trustline Verification and Setup Utilities using Stellar SDK.
 *
 * Implements inspection of account trustlines against Horizon balances,
 * reserve calculation (0.5 XLM per trustline subentry), and one-click
 * changeTrust transaction generation for Freighter signing.
 */

import {
  Asset,
  Account,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, HORIZON_URL } from "@/lib/constants";
import { signXdr, submitSignedXdr, WalletError } from "@/lib/stellar";

export interface AccountBalanceItem {
  asset_type: string;
  balance: string;
  asset_code?: string;
  asset_issuer?: string;
  limit?: string;
}

export interface RequiredAsset {
  code: string;
  issuer: string | null;
  name?: string;
}

export interface TrustlineVerificationResult {
  ready: boolean;
  missing: RequiredAsset[];
}

/** Stellar base reserve per entry (trustline, signer, data, offer) in XLM */
export const STELLAR_BASE_RESERVE = 0.5;
/** Stellar account base reserve (minimum 2 entries: account itself) in XLM */
export const STELLAR_MIN_ACCOUNT_RESERVE = 1.0;

/**
 * Check if a specific asset trustline exists on an account given its Horizon balances.
 * Native XLM or assets without an issuer are considered trusted by default.
 */
export function hasAccountTrustline(
  balances: AccountBalanceItem[],
  assetCode: string,
  assetIssuer?: string | null
): boolean {
  if (assetCode === "XLM" || !assetIssuer) {
    return true;
  }

  return balances.some(
    (b) =>
      b.asset_type !== "native" &&
      b.asset_code === assetCode &&
      b.asset_issuer === assetIssuer
  );
}

/**
 * Verify a list of required assets against account balances.
 * Returns which assets are missing trustlines and whether all requirements are satisfied.
 */
export function verifyAccountTrustlines(
  balances: AccountBalanceItem[],
  requiredAssets: RequiredAsset[]
): TrustlineVerificationResult {
  const missing = requiredAssets.filter(
    (asset) => !hasAccountTrustline(balances, asset.code, asset.issuer)
  );

  return {
    ready: missing.length === 0,
    missing,
  };
}

/**
 * Calculate the minimum XLM balance needed to support the existing subentries
 * plus additional new trustlines.
 */
export function calculateRequiredReserve(
  currentSubentries: number,
  additionalTrustlines = 1
): number {
  const totalEntries = 2 + currentSubentries + additionalTrustlines;
  return totalEntries * STELLAR_BASE_RESERVE;
}

/**
 * Verify whether the account's native XLM balance has sufficient available reserve
 * to add an additional trustline without hitting `op_low_reserve`.
 */
export function hasSufficientReserve(
  nativeBalance: string | number,
  subentryCount = 0,
  additionalTrustlines = 1
): boolean {
  const balanceNum = typeof nativeBalance === "string" ? parseFloat(nativeBalance) : nativeBalance;
  if (Number.isNaN(balanceNum) || balanceNum <= 0) return false;

  const requiredReserve = calculateRequiredReserve(subentryCount, additionalTrustlines);
  // Add a small buffer for transaction fees (e.g. 0.00001 XLM)
  return balanceNum >= requiredReserve + 0.001;
}

/**
 * Build a changeTrust transaction XDR for Freighter wallet signing.
 */
export function buildChangeTrustXdr(
  publicKey: string,
  sequence: string,
  assetCode: string,
  issuer: string,
  limit?: string
): string {
  const account = new Account(publicKey, sequence);
  const asset = new Asset(assetCode, issuer);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset,
        limit: limit ?? undefined,
      })
    )
    .setTimeout(300)
    .build();

  return tx.toXDR();
}

/**
 * Fetch account sequence from Horizon and build the changeTrust transaction.
 */
export async function prepareChangeTrustXdr(
  publicKey: string,
  assetCode: string,
  issuer: string,
  limit?: string
): Promise<string> {
  const response = await fetch(
    `${HORIZON_URL}/accounts/${encodeURIComponent(publicKey)}`
  );
  if (!response.ok) {
    throw new Error("Could not load account sequence from Horizon.");
  }
  const accountData = (await response.json()) as { sequence: string };
  return buildChangeTrustXdr(publicKey, accountData.sequence, assetCode, issuer, limit);
}

/**
 * Execute one-click trustline setup flow:
 * 1. Prepares change trust transaction XDR.
 * 2. Requests user signature in Freighter.
 * 3. Submits signed transaction to Horizon.
 *
 * Catches user rejections and insufficient reserve errors gracefully with descriptive messages.
 */
export async function addTrustlineWithFreighter(
  publicKey: string,
  assetCode: string,
  issuer: string,
  limit?: string
): Promise<{ txHash: string }> {
  try {
    const xdr = await prepareChangeTrustXdr(publicKey, assetCode, issuer, limit);
    const signedXdr = await signXdr(xdr, NETWORK_PASSPHRASE);
    const txHash = await submitSignedXdr(signedXdr);
    return { txHash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();

    if (lower.includes("op_low_reserve") || lower.includes("insufficient balance") || lower.includes("tx_insufficient_balance")) {
      throw new WalletError(
        "Insufficient XLM reserve. Adding a trustline requires an additional 0.5 XLM available in your wallet.",
        "unknown"
      );
    }

    if (lower.includes("user rejected") || lower.includes("user cancelled") || lower.includes("cancel")) {
      throw new WalletError("You cancelled the request. No trustline was added.", "user_rejected");
    }

    if (err instanceof WalletError) {
      throw err;
    }

    throw new WalletError(msg || "Could not add trustline. Please try again.", "unknown");
  }
}
