"use client";

/**
 * Wallet (Freighter) + SEP-10 helpers.
 *
 * Private keys never touch Mergepay. The API builds unsigned transaction
 * envelopes; the user's wallet signs them; the API submits and verifies.
 */

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
  constructor(message = "Freighter wallet not found. Install it from freighter.app and refresh.") {
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

// User-facing messages keyed by code. Processed before showing in the UI so
// raw provider strings — which can include method/path error context — are
// never rendered verbatim.
const MESSAGE_BY_CODE: Record<WalletErrorCode, string> = {
  not_installed: "Freighter wallet not found. Install it from freighter.app and refresh.",
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

function classifyWalletMessage(raw: string): WalletErrorCode {
  const msg = raw.toLowerCase();
  if (REJECTED_PATTERNS.some((p) => p.test(msg))) return "user_rejected";
  if (LOCKED_PATTERNS.some((p) => p.test(msg))) return "locked";
  if (DISCONNECTED_PATTERNS.some((p) => p.test(msg))) return "disconnected";
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
    default:
      return new WalletError(
        fallbackMessage ?? MESSAGE_BY_CODE.unknown,
        "unknown"
      );
  }
}

/** Handles both Freighter v1 (plain values) and v2+ ({ value, error }) APIs. */
function unwrap<T extends object | string>(
  result: T | { error?: { message?: string } | string },
  pick: (r: any) => string | undefined,
  context: "connect" | "sign"
): string {
  if (typeof result === "string") return result;
  const err = (result as any)?.error;
  if (err) {
    const raw = typeof err === "string" ? err : (err.message ?? "");
    // Never include the raw provider object — just the message string.
    const code = classifyWalletMessage(raw);
    // For signing, "user_rejected" is the most common — surface it cleanly.
    // Every rejected signature must NOT be auto-retried.
    throw errorForCode(code, context === "sign" && code === "user_rejected"
      ? undefined
      : raw || MESSAGE_BY_CODE[code]);
  }
  const value = pick(result);
  if (!value) throw errorForCode("disconnected");
  return value;
}

export async function isFreighterAvailable(): Promise<boolean> {
  try {
    const res = await isConnected();
    if (typeof res === "boolean") return res;
    return Boolean((res as any)?.isConnected);
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
    return unwrap(res as any, (r) => r.address ?? r.publicKey, "connect");
  } catch (e) {
    if (e instanceof WalletError) throw e;
    // Older Freighter versions expose getAddress / getPublicKey instead.
    try {
      const res = await getAddress();
      return unwrap(res as any, (r) => r.address ?? r.publicKey, "connect");
    } catch (inner) {
      if (inner instanceof WalletError) throw inner;
      throw errorForCode(classifyWalletMessage(String((inner as Error)?.message ?? inner)), (inner as Error)?.message);
    }
  }
}

export async function signXdr(
  xdr: string,
  networkPassphrase: string = NETWORK_PASSPHRASE
): Promise<string> {
  // Note: rejected signatures here are surfaced via `unwrap` and NEVER
  // retried automatically — the user must explicitly retry.
  const res = await signTransaction(xdr, { networkPassphrase });
  return unwrap(
    res as any,
    (r) => r.signedTxXdr ?? r.signedTransaction,
    "sign"
  );
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
