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

export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletError";
  }
}

/** Handles both Freighter v1 (plain values) and v2+ ({ value, error }) APIs. */
function unwrap<T extends object | string>(
  result: T | { error?: { message?: string } | string },
  pick: (r: any) => string | undefined
): string {
  if (typeof result === "string") return result;
  const err = (result as any)?.error;
  if (err) {
    throw new WalletError(typeof err === "string" ? err : err.message ?? "Wallet error");
  }
  const value = pick(result);
  if (!value) throw new WalletError("Wallet returned an empty response.");
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
    throw new WalletError(
      "Freighter wallet not found. Install it from freighter.app and refresh."
    );
  }
  try {
    const res = await requestAccess();
    return unwrap(res as any, (r) => r.address ?? r.publicKey);
  } catch (e) {
    if (e instanceof WalletError) throw e;
    // Older Freighter versions expose getAddress / getPublicKey instead.
    const res = await getAddress();
    return unwrap(res as any, (r) => r.address ?? r.publicKey);
  }
}

export async function signXdr(
  xdr: string,
  networkPassphrase: string = NETWORK_PASSPHRASE
): Promise<string> {
  const res = await signTransaction(xdr, { networkPassphrase });
  return unwrap(res as any, (r) => r.signedTxXdr ?? r.signedTransaction);
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
