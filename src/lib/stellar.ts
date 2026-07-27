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
  if (msg) throw new WalletError(msg);
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
    throw new WalletError(
      "Freighter wallet not found. Install it from freighter.app and refresh."
    );
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
