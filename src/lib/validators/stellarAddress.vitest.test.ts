import { describe, expect, it } from "vitest";
import {
  isValidStellarPublicKey,
  normalizeStellarAddress,
  validateStellarAddress,
} from "./stellarAddress";

// Deterministic fixtures derived from known seeds with @stellar/stellar-sdk.
const VALID_KEYS = [
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57",
  "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR",
  "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U",
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
];
const SECRET_SEED = "SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X";
const MUXED = "MDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCYAIBAEAQCAIBAH2KC";

/** Swap one character for a different valid base32 char to break the checksum. */
function flipChar(key: string, index: number): string {
  const next = key[index] === "A" ? "B" : "A";
  return key.slice(0, index) + next + key.slice(index + 1);
}

describe("validateStellarAddress", () => {
  it.each(VALID_KEYS)("accepts the valid G-address %s", (key) => {
    const r = validateStellarAddress(key);
    expect(r.status).toBe("valid");
    expect(r.isValid).toBe(true);
    expect(r.isError).toBe(false);
  });

  it("treats empty input as neutral, not an error", () => {
    const r = validateStellarAddress("");
    expect(r.status).toBe("empty");
    expect(r.isError).toBe(false);
    expect(r.isValid).toBe(false);
  });

  it("reports a partial G-address as incomplete, not an error", () => {
    for (const partial of ["G", "GDVEU", VALID_KEYS[0].slice(0, 55)]) {
      const r = validateStellarAddress(partial);
      expect(r.status).toBe("incomplete");
      expect(r.isError).toBe(false);
    }
  });

  it("rejects a key with a mistyped character via the checksum", () => {
    for (const i of [1, 20, 40, 55]) {
      expect(validateStellarAddress(flipChar(VALID_KEYS[0], i)).status).toBe("invalid_checksum");
    }
  });

  it("rejects characters outside the base32 alphabet", () => {
    for (const bad of ["G0VEU", "G1", "G8", "G9", "GDVEU-3DD", "GDVEU_3DD", "GÄ"]) {
      expect(validateStellarAddress(bad).status).toBe("invalid_characters");
    }
  });

  it("rejects keys with the wrong prefix", () => {
    expect(validateStellarAddress("ADVEU3DD").status).toBe("invalid_prefix");
    expect(validateStellarAddress("C" + VALID_KEYS[0].slice(1)).status).toBe("invalid_prefix");
  });

  it("rejects input longer than 56 characters", () => {
    expect(validateStellarAddress(VALID_KEYS[0] + "A").status).toBe("too_long");
  });

  it("warns loudly when a secret seed is pasted", () => {
    const r = validateStellarAddress(SECRET_SEED);
    expect(r.status).toBe("secret_key");
    expect(r.isError).toBe(true);
    expect(r.message).toMatch(/secret/i);
    // Even a partial seed is flagged immediately.
    expect(validateStellarAddress("SAD").status).toBe("secret_key");
  });

  it("rejects muxed M-addresses with a specific hint", () => {
    const r = validateStellarAddress(MUXED);
    expect(r.status).toBe("muxed_address");
    expect(r.message).toMatch(/muxed/i);
  });

  it("normalises lowercase and pasted whitespace before checking", () => {
    const messy = `  ${VALID_KEYS[0].slice(0, 20).toLowerCase()}\n${VALID_KEYS[0].slice(20, 40)} ${VALID_KEYS[0].slice(40)}\t`;
    const r = validateStellarAddress(messy);
    expect(r.normalized).toBe(VALID_KEYS[0]);
    expect(r.status).toBe("valid");
  });
});

describe("normalizeStellarAddress", () => {
  it("strips whitespace and uppercases", () => {
    expect(normalizeStellarAddress(" ga b\nc ")).toBe("GABC");
  });
});

describe("isValidStellarPublicKey", () => {
  it("is true only for complete, valid keys", () => {
    expect(isValidStellarPublicKey(VALID_KEYS[1])).toBe(true);
    expect(isValidStellarPublicKey(VALID_KEYS[1].slice(0, 50))).toBe(false);
    expect(isValidStellarPublicKey(SECRET_SEED)).toBe(false);
    expect(isValidStellarPublicKey(flipChar(VALID_KEYS[1], 10))).toBe(false);
    expect(isValidStellarPublicKey("")).toBe(false);
  });
});
