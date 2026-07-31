import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NETWORK,
  explorerAccountUrl,
  explorerBaseUrl,
  explorerTxUrl,
  isValidPublicKey,
  isValidTxHash,
  normalizeNetwork,
} from "../explorer";

/** A real 64-char hex transaction hash. */
const TX_HASH =
  "3389e9f0f1a65f19736cacf544c2e825313e8447f8592bf8e0b5b0f04b9bfd82";
/** A valid ed25519 account id (SDF testnet friendbot). */
const PUBLIC_KEY = "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR";

describe("normalizeNetwork", () => {
  it("maps every supported public alias", () => {
    for (const raw of ["public", "PUBLIC", " Public ", "pubnet", "mainnet"]) {
      assert.equal(normalizeNetwork(raw), "public", raw);
    }
  });

  it("maps every supported testnet alias", () => {
    for (const raw of ["testnet", "TESTNET", " testnet ", "test"]) {
      assert.equal(normalizeNetwork(raw), "testnet", raw);
    }
  });

  it("falls back to the default network for unknown values", () => {
    assert.equal(normalizeNetwork("futurenet"), DEFAULT_NETWORK);
    assert.equal(normalizeNetwork(""), DEFAULT_NETWORK);
    assert.equal(normalizeNetwork(undefined), DEFAULT_NETWORK);
    assert.equal(normalizeNetwork(null), DEFAULT_NETWORK);
  });
});

describe("explorerBaseUrl", () => {
  it("points at the network it is given", () => {
    assert.equal(
      explorerBaseUrl("public"),
      "https://stellar.expert/explorer/public"
    );
    assert.equal(
      explorerBaseUrl("testnet"),
      "https://stellar.expert/explorer/testnet"
    );
  });
});

describe("isValidTxHash", () => {
  it("accepts a 64-character hex hash in either case", () => {
    assert.equal(isValidTxHash(TX_HASH), true);
    assert.equal(isValidTxHash(TX_HASH.toUpperCase()), true);
  });

  it("rejects anything that is not a 64-character hex string", () => {
    assert.equal(isValidTxHash(""), false);
    assert.equal(isValidTxHash(TX_HASH.slice(0, 63)), false);
    assert.equal(isValidTxHash(`${TX_HASH}0`), false);
    assert.equal(isValidTxHash(`${TX_HASH.slice(0, 63)}z`), false);
    assert.equal(isValidTxHash("../../etc/passwd"), false);
    assert.equal(isValidTxHash(null), false);
    assert.equal(isValidTxHash(undefined), false);
    assert.equal(isValidTxHash(42), false);
  });
});

describe("isValidPublicKey", () => {
  it("accepts a valid ed25519 account id", () => {
    assert.equal(isValidPublicKey(PUBLIC_KEY), true);
  });

  it("rejects malformed and non-string keys", () => {
    assert.equal(isValidPublicKey(`${PUBLIC_KEY}X`), false);
    assert.equal(isValidPublicKey("GBAD"), false);
    assert.equal(isValidPublicKey(""), false);
    assert.equal(isValidPublicKey(null), false);
    assert.equal(isValidPublicKey(undefined), false);
  });
});

describe("explorerTxUrl", () => {
  it("builds a mainnet link for the public network", () => {
    assert.equal(
      explorerTxUrl(TX_HASH, "public"),
      `https://stellar.expert/explorer/public/tx/${TX_HASH}`
    );
  });

  it("builds a testnet link for the test network", () => {
    assert.equal(
      explorerTxUrl(TX_HASH, "testnet"),
      `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`
    );
  });

  it("normalizes the hash to lower case", () => {
    assert.equal(
      explorerTxUrl(TX_HASH.toUpperCase(), "testnet"),
      `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`
    );
  });

  it("returns null for a missing hash (pending settlement)", () => {
    assert.equal(explorerTxUrl(null, "testnet"), null);
    assert.equal(explorerTxUrl(undefined, "testnet"), null);
    assert.equal(explorerTxUrl("", "testnet"), null);
  });

  it("returns null for a malformed hash instead of a broken link", () => {
    assert.equal(explorerTxUrl("not-a-hash", "public"), null);
    assert.equal(explorerTxUrl(TX_HASH.slice(0, 10), "public"), null);
    assert.equal(explorerTxUrl(`${TX_HASH}/../account`, "public"), null);
  });

  it("uses the configured network when none is passed", () => {
    const url = explorerTxUrl(TX_HASH);
    assert.equal(url, `${explorerBaseUrl()}/tx/${TX_HASH}`);
  });
});

describe("explorerAccountUrl", () => {
  it("builds a link on each supported network", () => {
    assert.equal(
      explorerAccountUrl(PUBLIC_KEY, "public"),
      `https://stellar.expert/explorer/public/account/${PUBLIC_KEY}`
    );
    assert.equal(
      explorerAccountUrl(PUBLIC_KEY, "testnet"),
      `https://stellar.expert/explorer/testnet/account/${PUBLIC_KEY}`
    );
  });

  it("returns null for missing or malformed account ids", () => {
    assert.equal(explorerAccountUrl(null, "public"), null);
    assert.equal(explorerAccountUrl(undefined, "public"), null);
    assert.equal(explorerAccountUrl("", "public"), null);
    assert.equal(explorerAccountUrl("GNOPE", "public"), null);
  });
});
