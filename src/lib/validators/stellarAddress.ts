/**
 * Real-time validation for Stellar public key (G-address) inputs (#893).
 *
 * Every keystroke goes through `validateStellarAddress`, so the cheap checks
 * (length, prefix, base32 alphabet) run first and only a complete, well-shaped
 * 56-character string reaches the SDK's `StrKey` checksum verification. That
 * keeps validation effectively free while the user is still typing on a slow
 * mobile device.
 *
 * The result is a discriminated status rather than a boolean so the UI can
 * tell "still typing" apart from "definitely wrong", and can give a specific
 * hint for the most common mistakes: a pasted secret seed, a muxed M-address,
 * a lowercase copy, or a single mistyped character (checksum failure).
 */

import { StrKey } from "@stellar/stellar-sdk";

/** Length of every ed25519 StrKey (G… public key, S… secret seed). */
export const STELLAR_PUBLIC_KEY_LENGTH = 56;

export type StellarAddressStatus =
  /** Nothing typed yet. */
  | "empty"
  /** A valid prefix of a G-address; keep typing. */
  | "incomplete"
  /** A complete, checksum-verified G-address. */
  | "valid"
  /** Contains characters outside the base32 alphabet (A–Z, 2–7). */
  | "invalid_characters"
  /** Does not start with G. */
  | "invalid_prefix"
  /** Longer than 56 characters. */
  | "too_long"
  /** Right shape but the checksum does not match: a typo. */
  | "invalid_checksum"
  /** Looks like a secret seed (S…). Must never be shared. */
  | "secret_key"
  /** A muxed M-address, which is not accepted where a G-address is needed. */
  | "muxed_address";

export interface StellarAddressValidation {
  status: StellarAddressStatus;
  /** The trimmed, uppercased value that was checked. */
  normalized: string;
  /** True only for `"valid"`. */
  isValid: boolean;
  /** True when the input is definitely wrong (not just incomplete). */
  isError: boolean;
  /** User-facing helper text for the current status. */
  message: string;
}

const BASE32 = /^[A-Z2-7]*$/;

const MESSAGES: Record<StellarAddressStatus, string> = {
  empty: "Enter a 56-character Stellar public key starting with G.",
  incomplete: "Keep typing — Stellar public keys are 56 characters long.",
  valid: "Valid Stellar public key.",
  invalid_characters:
    "Stellar public keys only use the letters A–Z and digits 2–7.",
  invalid_prefix: "Stellar public keys start with the letter G.",
  too_long: "Too long — Stellar public keys are exactly 56 characters.",
  invalid_checksum:
    "Checksum mismatch — one or more characters look mistyped. Copy the address again.",
  secret_key:
    "This is a SECRET key (starts with S). Never share it — paste the public G-address instead.",
  muxed_address:
    "Muxed (M…) addresses aren't supported here. Use the base G-address.",
};

/**
 * Normalise user input: drop all whitespace (addresses are often pasted with
 * line breaks or spaces from chat apps) and uppercase it, since base32 is
 * case-insensitive but StrKey requires uppercase.
 */
export function normalizeStellarAddress(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function result(
  status: StellarAddressStatus,
  normalized: string
): StellarAddressValidation {
  return {
    status,
    normalized,
    isValid: status === "valid",
    isError: status !== "valid" && status !== "empty" && status !== "incomplete",
    message: MESSAGES[status],
  };
}

/** Classify a (possibly partial) G-address as the user types it. */
export function validateStellarAddress(raw: string): StellarAddressValidation {
  const value = normalizeStellarAddress(raw ?? "");
  if (value === "") return result("empty", value);
  if (!BASE32.test(value)) return result("invalid_characters", value);

  const first = value[0];
  if (first === "S") {
    // Flag a secret seed as early as possible, even before it is complete.
    return result("secret_key", value);
  }
  if (first === "M") return result("muxed_address", value);
  if (first !== "G") return result("invalid_prefix", value);

  if (value.length < STELLAR_PUBLIC_KEY_LENGTH) return result("incomplete", value);
  if (value.length > STELLAR_PUBLIC_KEY_LENGTH) return result("too_long", value);

  return StrKey.isValidEd25519PublicKey(value)
    ? result("valid", value)
    : result("invalid_checksum", value);
}

/** Boolean shorthand for schemas and guards. */
export function isValidStellarPublicKey(raw: string): boolean {
  return validateStellarAddress(raw).isValid;
}
