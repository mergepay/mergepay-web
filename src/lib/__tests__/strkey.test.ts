import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StrKey, isValidEd25519PublicKey } from "../strkey";

/**
 * Known-valid mainnet ed25519 public keys:
 *  - the checksummed key used by the QR scanner tests,
 *  - the canonical Circle USDC issuer.
 */
const VALID_KEYS = [
  "GBDIT4GPLGXKTQH2O2UYV7XKZPFT2OQ3GQ3H4J6B7Y5XGQY3UHMDXRUB",
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
];

function replaceAt(value: string, index: number, char: string): string {
  return value.slice(0, index) + char + value.slice(index + 1);
}

function flipChar(value: string, index: number): string {
  return replaceAt(value, index, value[index] === "A" ? "B" : "A");
}

describe("StrKey ed25519 public key validation (#493)", () => {
  it("accepts known-valid public keys", () => {
    for (const key of VALID_KEYS) {
      assert.equal(StrKey.isValidEd25519PublicKey(key), true, key);
    }
  });

  it("exposes a standalone predicate with identical results", () => {
    for (const key of VALID_KEYS) {
      assert.equal(isValidEd25519PublicKey(key), true, key);
    }
    assert.equal(isValidEd25519PublicKey("not-a-key"), false);
  });

  it("rejects keys that do not start with an uppercase 'G'", () => {
    const secret = `S${VALID_KEYS[0].slice(1)}`;
    assert.equal(StrKey.isValidEd25519PublicKey(secret), false);
    assert.equal(StrKey.isValidEd25519PublicKey(VALID_KEYS[0].toLowerCase()), false);
  });

  it("rejects keys of the wrong length", () => {
    assert.equal(StrKey.isValidEd25519PublicKey(VALID_KEYS[0].slice(0, 55)), false);
    assert.equal(StrKey.isValidEd25519PublicKey(`${VALID_KEYS[0]}A`), false);
    assert.equal(StrKey.isValidEd25519PublicKey("G"), false);
    assert.equal(StrKey.isValidEd25519PublicKey(""), false);
  });

  it("rejects characters outside the base32 alphabet", () => {
    for (const bad of ["0", "1", "8", "9", "!"]) {
      assert.equal(
        StrKey.isValidEd25519PublicKey(replaceAt(VALID_KEYS[0], 10, bad)),
        false,
        bad
      );
    }
    assert.equal(StrKey.isValidEd25519PublicKey("GABC DEF"), false);
  });

  it("rejects a corrupted trailing checksum", () => {
    assert.equal(StrKey.isValidEd25519PublicKey(flipChar(VALID_KEYS[0], 55)), false);
  });

  it("rejects a tampered payload whose checksum no longer matches", () => {
    assert.equal(StrKey.isValidEd25519PublicKey(flipChar(VALID_KEYS[0], 20)), false);
  });

  it("is defensive against non-string input", () => {
    assert.equal(StrKey.isValidEd25519PublicKey(undefined as unknown as string), false);
    assert.equal(StrKey.isValidEd25519PublicKey(null as unknown as string), false);
    assert.equal(StrKey.isValidEd25519PublicKey(123 as unknown as string), false);
  });
});
