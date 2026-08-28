"use client";

/**
 * Wallet (Freighter) + SEP-10 helpers.
 *
 * Private keys never touch Mergepay. The API builds unsigned transaction
 * envelopes; the user's wallet signs them; the API submits and verifies.
 */

import type { ReactNode } from "react";
import {
  isConnected,
  requestAccess,
  getAddress,
  getNetworkDetails,
  getNetwork,
  signTransaction,
} from "@stellar/freighter-api";
import { api } from "./api";
import { Asset, Operation, TransactionBuilder, Account } from "@stellar/stellar-sdk";
import { useAuth } from "./auth-store";
import {
  describeNetwork,
  EXPECTED_NETWORK_LABEL,
  NETWORK_PASSPHRASE,
} from "./constants";
import type { User } from "./types";
import type { WalletProbe } from "./walletReadiness";
import type { WalletSnapshot } from "./walletSession";

export const FREIGHTER_INSTALL_URL = "https://freighter.app";

export async function hasTrustline(publicKey: string, assetCode: string, issuer: string): Promise<boolean> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org"}/accounts/${encodeURIComponent(publicKey)}`);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("Could not check the asset trustline");
  const account = (await response.json()) as { balances?: Array<{ asset_code?: string; asset_issuer?: string }> };
  return account.balances?.some((balance) => balance.asset_code === assetCode && balance.asset_issuer === issuer) ?? false;
}

export function buildTrustlineXdr(publicKey: string, sequence: string, assetCode: string, issuer: string): string {
  const account = new Account(publicKey, sequence);
  return new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: new Asset(assetCode, issuer) }))
    .setTimeout(300)
    .build().toXDR();
}

export async function prepareTrustlineXdr(publicKey: string, assetCode: string, issuer: string): Promise<string> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org"}/accounts/${encodeURIComponent(publicKey)}`);
  if (!response.ok) throw new Error("Could not load the wallet sequence");
  const account = (await response.json()) as { sequence: string };
  return buildTrustlineXdr(publicKey, account.sequence, assetCode, issuer);
}

/**
 * Code representing a wallet-side failure mode. Codes are stable strings —
 * they are safe to log and to render after translation.
 */
export type WalletErrorCode =
  | "not_installed"
  | "locked"
  | "user_rejected"
  | "disconnected"
  | "network"
  | "network_mismatch"
  | "unknown";

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(message: string, code: WalletErrorCode = "unknown") {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

export class WalletNotInstalledError extends WalletError {
  constructor(
    message = "Stellar Freighter extension not found. Please install it from freighter.app."
  ) {
    super(message, "not_installed");
    this.name = "WalletNotInstalledError";
  }
}

export class WalletLockedError extends WalletError {
  constructor(message = "Your Freighter wallet is locked. Unlock it and try again.") {
    super(message, "locked");
    this.name = "WalletLockedError";
  }
}

export class UserRejectedError extends WalletError {
  constructor(message = "You cancelled the request. No transaction was submitted.") {
    super(message, "user_rejected");
    this.name = "UserRejectedError";
  }
}

export class WalletDisconnectedError extends WalletError {
  constructor(message = "Wallet connection was lost. Reconnect Freighter to continue.") {
    super(message, "disconnected");
    this.name = "WalletDisconnectedError";
  }
}

export class WalletNetworkError extends WalletError {
  constructor(message = "Couldn't reach the wallet. Check Freighter and try again.") {
    super(message, "network");
    this.name = "WalletNetworkError";
  }
}

/**
 * The wallet is pointed at a different Stellar network than this deployment.
 *
 * Carries both names so the UI can state the problem and the fix without
 * re-deriving anything; `message` is already user-facing copy.
 */
export class NetworkMismatchError extends WalletError {
  /** What the wallet is on, e.g. "Stellar Testnet" or "FUTURENET". */
  walletNetwork: string;
  /** What this deployment expects, e.g. "Stellar Mainnet". */
  expectedNetwork: string;
  constructor(walletNetwork: string, expectedNetwork = EXPECTED_NETWORK_LABEL) {
    super(
      `Your wallet is on ${walletNetwork} — switch it to ${expectedNetwork} to continue.`,
      "network_mismatch"
    );
    this.name = "NetworkMismatchError";
    this.walletNetwork = walletNetwork;
    this.expectedNetwork = expectedNetwork;
  }
}

// User-facing messages keyed by code. Processed before showing in the UI so
// raw provider strings — which can include method/path error context — are
// never rendered verbatim.
const MESSAGE_BY_CODE: Record<WalletErrorCode, string> = {
  not_installed:
    "Stellar Freighter extension not found. Please install it from freighter.app.",
  locked: "Your Freighter wallet is locked. Unlock it and try again.",
  user_rejected: "You cancelled the request. No transaction was submitted.",
  disconnected: "Wallet connection was lost. Reconnect Freighter to continue.",
  network: "Couldn't reach the wallet. Check Freighter and try again.",
  network_mismatch: `Your wallet is on a different Stellar network. Switch it to ${EXPECTED_NETWORK_LABEL} and try again.`,
  unknown: "The wallet returned an unexpected error. Please try again.",
};

/** Map a code to a safe message; falls back to "unknown" copy. */
export function walletMessage(code: WalletErrorCode): string {
  return MESSAGE_BY_CODE[code];
}

// Substring classifiers. Order matters: more specific patterns first.
const REJECTED_PATTERNS = [
  /user (denied|declined|cancelled|canceled|rejected)/i,
  /request was rejected/i,
  /user closed (the )?popup/i,
  /cancelled? by user/i,
];
const LOCKED_PATTERNS = [
  /locked/i,
  /please unlock/i,
  /unlock (your )?(freighter|wallet)/i,
  /wallet is locked/i,
];
const DISCONNECTED_PATTERNS = [
  /(wallet )?not connected/i,
  /no account selected/i,
  /account changed/i,
  /disconnected/i,
];
const NETWORK_PATTERNS = [
  /network/i,
  /passphrase/i,
  /couldn't reach/i,
  /failed to fetch/i,
];

export function classifyWalletMessage(raw: string): WalletErrorCode {
  const msg = raw.toLowerCase();
  if (REJECTED_PATTERNS.some((p) => p.test(msg))) return "user_rejected";
  if (LOCKED_PATTERNS.some((p) => p.test(msg))) return "locked";
  if (DISCONNECTED_PATTERNS.some((p) => p.test(msg))) return "disconnected";
  if (NETWORK_PATTERNS.some((p) => p.test(msg))) return "network";
  return "unknown";
}

function errorForCode(code: WalletErrorCode, fallbackMessage?: string): WalletError {
  switch (code) {
    case "not_installed":
      return new WalletNotInstalledError();
    case "locked":
      return new WalletLockedError();
    case "user_rejected":
      return new UserRejectedError();
    case "disconnected":
      return new WalletDisconnectedError();
    case "network":
      return new WalletNetworkError();
    default:
      return new WalletError(
        fallbackMessage ?? MESSAGE_BY_CODE.unknown,
        "unknown"
      );
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function extractError(result: Record<string, unknown>): string | undefined {
  const err = result.error;
  if (typeof err === "string") return err;
  if (isObject(err) && typeof err.message === "string") return err.message;
  return undefined;
}

function throwOnError(result: unknown): void {
  if (!isObject(result)) return;
  const msg = extractError(result);
  if (msg) {
    const code = classifyWalletMessage(msg);
    // Don't pass the raw msg to unknown error to avoid leaking internal details
    throw errorForCode(code);
  }
}

export async function isFreighterAvailable(): Promise<boolean> {
  try {
    const res = await isConnected();
    if (typeof res === "boolean") return res;
    if (isObject(res) && typeof res.isConnected === "boolean") return res.isConnected;
    return false;
  } catch {
    return false;
  }
}

/**
 * Read the already-granted public address without prompting.
 *
 * Returns `null` when the wallet is missing, locked, or has not shared an
 * account — all of which are ordinary "not connected yet" states, not errors.
 * Only the public address is read; no call here can return secret material.
 */
export async function getGrantedAddress(): Promise<string | null> {
  try {
    const res = await getAddress();
    if (typeof res === "string") return res || null;
    if (isObject(res)) {
      if (extractError(res)) return null;
      const address = res.address;
      if (typeof address === "string" && address) return address;
    }
    return null;
  } catch {
    return null;
  }
}

/** Network the wallet is currently pointed at, or `null` if unreadable. */
export async function getWalletNetwork(): Promise<{
  network: string;
  networkPassphrase: string;
} | null> {
  try {
    const res = await getNetworkDetails();
    if (!isObject(res) || extractError(res)) return null;
    const { network, networkPassphrase } = res;
    if (typeof networkPassphrase !== "string" || !networkPassphrase) return null;
    return {
      network: typeof network === "string" ? network : "",
      networkPassphrase,
    };
  } catch {
    return null;
  }
}

/**
 * Throw a `NetworkMismatchError` when the wallet would sign against a
 * different network than this deployment builds for.
 *
 * Silent when the network cannot be read: `getWalletNetwork` returns `null`
 * for a wallet that is missing, locked, or has not granted access, and a
 * reading we failed to take is not evidence of a mismatch. Freighter itself
 * rejects a signature carrying the wrong passphrase, so the worst case is the
 * behaviour we already had.
 */
export async function assertWalletNetwork(): Promise<void> {
  const active = await getWalletNetwork();
  if (!active) return;
  if (active.networkPassphrase === NETWORK_PASSPHRASE) return;
  throw new NetworkMismatchError(
    describeNetwork(active.networkPassphrase, active.network)
  );
}

/**
 * Read the active public key **without prompting**.
 *
 * `getAddress` resolves to an empty address (or an error field) when the
 * app has not been granted access, and never opens a Freighter popup —
 * so this is safe to call on load to find out whether a persisted
 * session can be resumed at all.
 */
export async function readWalletSnapshot(): Promise<WalletSnapshot> {
  if (!(await isFreighterAvailable())) {
    return { status: "unavailable", publicKey: null };
  }
  try {
    const res = await getAddress();
    if (isObject(res) && !extractError(res) && typeof res.address === "string") {
      return { status: "resolved", publicKey: res.address || null };
    }
  } catch {
    // The extension answered badly — treat it as "no account shared"
    // rather than "no wallet", so the user is asked to reconnect.
  }
  return { status: "resolved", publicKey: null };
}

/** Ask Freighter for the active public key (prompting for access if needed). */
export async function connectWallet(): Promise<string> {
  const available = await isFreighterAvailable();
  if (!available) {
    throw new WalletNotInstalledError();
  }
  try {
    const res = await requestAccess();
    throwOnError(res);
    if (typeof res === "string") return res;
    if (isObject(res)) {
      const r = res as Record<string, unknown>;
      const pk =
        (typeof r.address === "string" ? r.address : undefined) ??
        (typeof r.publicKey === "string" ? r.publicKey : undefined);
      if (pk) return pk;
    }
    throw new WalletError("Wallet returned an empty response.");
  } catch (e) {
    if (e instanceof WalletError) throw e;
    // Older Freighter versions expose getAddress / getPublicKey instead.
    const res = await getAddress();
    throwOnError(res);
    if (isObject(res)) {
      const r = res as Record<string, unknown>;
      const pk =
        (typeof r.address === "string" ? r.address : undefined) ??
        (typeof r.publicKey === "string" ? r.publicKey : undefined);
      if (pk) return pk;
    }
    throw new WalletError("Wallet returned an empty response.");
  }
}

/**
 * Read the wallet's current account and network **without prompting**.
 *
 * `getAddress` resolves to an empty address when the app has not been
 * granted access, and `getNetwork` reports the network the extension is
 * configured for. Neither opens a Freighter popup, so this is safe to
 * call on render to decide whether an action should be offered at all.
 */
export async function probeWallet(): Promise<WalletProbe> {
  if (!(await isFreighterAvailable())) {
    return { status: "unavailable", publicKey: null, networkPassphrase: null };
  }

  const [addressResult, networkResult] = await Promise.all([
    getAddress().catch(() => null),
    getNetwork().catch(() => null),
  ]);

  const publicKey =
    isObject(addressResult) && typeof addressResult.address === "string"
      ? addressResult.address || null
      : null;

  const hasNetworkError = isObject(networkResult)
    ? extractError(networkResult) !== undefined
    : true;
  const networkPassphrase =
    !hasNetworkError &&
    isObject(networkResult) &&
    typeof networkResult.networkPassphrase === "string"
      ? networkResult.networkPassphrase
      : null;
  const networkName =
    !hasNetworkError && isObject(networkResult) && typeof networkResult.network === "string"
      ? networkResult.network
      : null;

  // An address error means "no account shared", not "no wallet" — the
  // extension answered. Readiness turns that into a connect prompt.
  return {
    status: "resolved",
    publicKey: isObject(addressResult) && extractError(addressResult) ? null : publicKey,
    networkPassphrase,
    networkName,
  };
}

export async function signXdr(
  xdr: string,
  networkPassphrase: string = NETWORK_PASSPHRASE
): Promise<string> {
  // Note: rejected signatures here are surfaced via `unwrap` and NEVER
  // retried automatically — the user must explicitly retry.
  const res = await signTransaction(xdr, { networkPassphrase });
  throwOnError(res);
  if (typeof res === "string") return res;
  if (isObject(res)) {
    const r = res as Record<string, unknown>;
    const signed =
      (typeof r.signedTxXdr === "string" ? r.signedTxXdr : undefined) ??
      (typeof r.signedTransaction === "string" ? r.signedTransaction : undefined);
    if (signed) return signed;
  }
  throw new WalletError("Wallet returned an empty response.");
}

/**
 * Full SEP-10 login:
 *  1. confirm the wallet is on the network this deployment targets,
 *  2. fetch a challenge transaction for the wallet's account,
 *  3. sign it in Freighter,
 *  4. send it back for verification, receive a JWT session.
 */
export async function loginWithWallet(): Promise<User> {
  const publicKey = await connectWallet();
  // Checked after access is granted (Freighter only reports its network to an
  // allowed origin) and before the challenge is built: a challenge for one
  // network signed against another fails with an opaque error.
  await assertWalletNetwork();
  const challenge = await api.authChallenge(publicKey);
  const signed = await signXdr(challenge.transaction, challenge.networkPassphrase);
  const { token, user } = await api.authVerify(signed);
  useAuth.getState().setSession(token, user);
  return user;
}

export async function logout() {
  try {
    await api.authLogout();
  } catch {
    // best effort — clear local session regardless
  }
  useAuth.getState().clear();
}

/**
 * Sign a settlement intent XDR and confirm it with the API
 * (which submits to the Stellar network and records the tx hash).
 */
export async function signAndConfirmSettlement(
  settlementId: string,
  xdr: string,
  networkPassphrase: string
) {
  const signedXdr = await signXdr(xdr, networkPassphrase);
  return api.confirmSettlement(settlementId, { signedXdr });
}

export async function signAndConfirmTreasuryTx(
  txId: string,
  xdr: string,
  networkPassphrase: string
) {
  const signedXdr = await signXdr(xdr, networkPassphrase);
  return api.confirmTreasuryTx(txId, { signedXdr });
}

/** User-friendly message with a link, shown when Freighter is not installed. */
export function NotInstalledMessage(): ReactNode {
  return (
    <>
      Stellar Freighter extension not found. Please{" "}
      <a
        href={FREIGHTER_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        install it
      </a>{" "}
      and refresh the page.
    </>
  );
}
