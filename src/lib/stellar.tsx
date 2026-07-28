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
  signTransaction,
} from "@stellar/freighter-api";
import { api } from "./api";
import { useAuth } from "./auth-store";
import { NETWORK_PASSPHRASE } from "./constants";
import type { User } from "./types";

export const FREIGHTER_INSTALL_URL = "https://freighter.app";

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
 *  1. fetch a challenge transaction for the wallet's account,
 *  2. sign it in Freighter,
 *  3. send it back for verification, receive a JWT session.
 */
export async function loginWithWallet(): Promise<User> {
  const publicKey = await connectWallet();
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

// Re-export the helper so other modules (e.g. UI) can map codes to messages
// without depending on internal classifier strings.
export { classifyWalletMessage };

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
