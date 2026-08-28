import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NetworkMismatchError, WalletError } from "../stellar";
import {
  describeNetwork,
  EXPECTED_NETWORK_LABEL,
  NETWORK_PASSPHRASES,
} from "../constants";

// No NEXT_PUBLIC_STELLAR_NETWORK is set under test, so the app falls back to
// its "public" default.
describe("expected network", () => {
  it("defaults to Stellar Mainnet", () => {
    assert.equal(EXPECTED_NETWORK_LABEL, "Stellar Mainnet");
  });
});

describe("NetworkMismatchError", () => {
  it("is a WalletError with a distinct code", () => {
    const err = new NetworkMismatchError("Stellar Testnet");
    assert.ok(err instanceof WalletError);
    assert.ok(err instanceof Error);
    assert.equal(err.code, "network_mismatch");
    assert.equal(err.name, "NetworkMismatchError");
  });

  it("names both networks in the message", () => {
    const err = new NetworkMismatchError("Stellar Testnet");
    assert.match(err.message, /Stellar Testnet/);
    assert.match(err.message, /Stellar Mainnet/);
    assert.match(err.message, /switch/i);
  });

  it("exposes both networks as fields for the UI", () => {
    const err = new NetworkMismatchError("Stellar Testnet");
    assert.equal(err.walletNetwork, "Stellar Testnet");
    assert.equal(err.expectedNetwork, "Stellar Mainnet");
  });

  it("carries an unrecognised network name through verbatim", () => {
    const err = new NetworkMismatchError("FUTURENET");
    assert.equal(err.walletNetwork, "FUTURENET");
    assert.match(err.message, /FUTURENET/);
  });

  it("is distinguishable from a generic wallet error", () => {
    const generic = new WalletError("boom", "network");
    assert.equal(generic instanceof NetworkMismatchError, false);
    assert.equal(new NetworkMismatchError("x") instanceof WalletError, true);
  });
});

// The label in the error comes from `describeNetwork`, so the mismatch message
// is only ever as good as this mapping.
describe("network naming used by the mismatch message", () => {
  it("names the known networks", () => {
    assert.equal(describeNetwork(NETWORK_PASSPHRASES.public), "Stellar Mainnet");
    assert.equal(describeNetwork(NETWORK_PASSPHRASES.testnet), "Stellar Testnet");
  });

  it("prefers the passphrase over a conflicting wallet-reported name", () => {
    assert.equal(
      describeNetwork(NETWORK_PASSPHRASES.testnet, "PUBLIC"),
      "Stellar Testnet"
    );
  });

  it("falls back to the wallet's own name for an unknown passphrase", () => {
    assert.equal(
      describeNetwork("Test SDF Future Network ; October 2022", "FUTURENET"),
      "FUTURENET"
    );
  });

  it("never renders an empty network", () => {
    assert.equal(describeNetwork(null), "an unrecognised network");
    assert.equal(describeNetwork("", "  "), "an unrecognised network");
  });
});
