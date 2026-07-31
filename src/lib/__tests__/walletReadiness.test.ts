import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWalletReadiness,
  isRecoverableInWallet,
  type WalletProbe,
  type WalletReadinessInput,
} from "../walletReadiness";
import {
  NETWORK_PASSPHRASES,
  describeNetwork,
  networkFromPassphrase,
} from "../constants";

const SESSION_KEY = "GABCSESSIONACCOUNT00000000000000000000000000000000000";
const OTHER_KEY = "GXYZOTHERACCOUNT000000000000000000000000000000000000";

const TESTNET = NETWORK_PASSPHRASES.testnet;
const PUBLIC = NETWORK_PASSPHRASES.public;

/** A wallet that is connected, on the session account and on testnet. */
function ready(overrides: Partial<WalletReadinessInput> = {}): WalletReadinessInput {
  return {
    status: "resolved",
    publicKey: SESSION_KEY,
    networkPassphrase: TESTNET,
    sessionPublicKey: SESSION_KEY,
    expectedNetworkPassphrase: TESTNET,
    expectedNetworkLabel: "Stellar Testnet",
    ...overrides,
  };
}

describe("evaluateWalletReadiness — blocking states (#112)", () => {
  it("blocks while the wallet is still being probed", () => {
    const result = evaluateWalletReadiness(ready({ status: "checking" }));
    assert.equal(result.ready, false);
    assert.equal(result.code, "checking");
  });

  it("blocks when Freighter is not installed, and points at the install", () => {
    const result = evaluateWalletReadiness(
      ready({ status: "unavailable", publicKey: null, networkPassphrase: null })
    );
    assert.equal(result.ready, false);
    assert.equal(result.code, "wallet_unavailable");
    assert.equal(result.recovery, "install_wallet");
  });

  it("blocks when no account is connected, and offers a connect action", () => {
    const result = evaluateWalletReadiness(ready({ publicKey: null }));
    assert.equal(result.ready, false);
    assert.equal(result.code, "wallet_disconnected");
    assert.equal(result.recovery, "connect_wallet");
  });

  it("blocks when the wallet is on a different network", () => {
    const result = evaluateWalletReadiness(ready({ networkPassphrase: PUBLIC }));
    assert.equal(result.ready, false);
    assert.equal(result.code, "network_mismatch");
    assert.equal(result.recovery, "switch_network");
  });

  it("names both networks so the user knows what to change", () => {
    const result = evaluateWalletReadiness(ready({ networkPassphrase: PUBLIC }));
    assert.match(result.detail, /Stellar Testnet/);
    assert.match(result.detail, /Stellar Mainnet/);
  });

  it("describes an unknown network by the wallet's own name", () => {
    const result = evaluateWalletReadiness(
      ready({ networkPassphrase: "Some Custom Network ; 2026", networkName: "FUTURENET" })
    );
    assert.equal(result.code, "network_mismatch");
    assert.match(result.detail, /FUTURENET/);
  });

  it("blocks when the wallet reports no network at all", () => {
    const result = evaluateWalletReadiness(ready({ networkPassphrase: null }));
    assert.equal(result.ready, false);
    assert.equal(result.code, "network_mismatch");
  });

  it("blocks when the active account is not the session account", () => {
    const result = evaluateWalletReadiness(ready({ publicKey: OTHER_KEY }));
    assert.equal(result.ready, false);
    assert.equal(result.code, "account_mismatch");
    assert.equal(result.recovery, "switch_account");
  });

  it("reports the account mismatch first when the network is wrong too", () => {
    // The envelope is bound to the session account, so a wrong account is
    // not a setting the user can flip after signing.
    const result = evaluateWalletReadiness(
      ready({ publicKey: OTHER_KEY, networkPassphrase: PUBLIC })
    );
    assert.equal(result.code, "account_mismatch");
  });

  it("never marks a blocked state as ready", () => {
    const blocked: Partial<WalletReadinessInput>[] = [
      { status: "checking" },
      { status: "unavailable" },
      { publicKey: null },
      { publicKey: OTHER_KEY },
      { networkPassphrase: PUBLIC },
      { networkPassphrase: null },
    ];
    for (const overrides of blocked) {
      assert.equal(evaluateWalletReadiness(ready(overrides)).ready, false);
    }
  });

  it("always explains itself", () => {
    const blocked = evaluateWalletReadiness(ready({ publicKey: null }));
    assert.ok(blocked.title.length > 0);
    assert.ok(blocked.detail.length > 0);
  });
});

describe("evaluateWalletReadiness — ready state (#112)", () => {
  it("allows a connected wallet on the matching network", () => {
    const result = evaluateWalletReadiness(ready());
    assert.equal(result.ready, true);
    assert.equal(result.code, "ready");
    assert.equal(result.recovery, "none");
  });

  it("allows any connected account when there is no session to match", () => {
    const result = evaluateWalletReadiness(
      ready({ publicKey: OTHER_KEY, sessionPublicKey: null })
    );
    assert.equal(result.ready, true);
  });

  it("matches the mainnet passphrase when the app is configured for it", () => {
    const result = evaluateWalletReadiness(
      ready({
        networkPassphrase: PUBLIC,
        expectedNetworkPassphrase: PUBLIC,
        expectedNetworkLabel: "Stellar Mainnet",
      })
    );
    assert.equal(result.ready, true);
  });
});

describe("evaluateWalletReadiness — transitions (#112)", () => {
  const probes: Record<string, WalletProbe> = {
    checking: {
      status: "checking",
      publicKey: null,
      networkPassphrase: null,
    },
    disconnected: {
      status: "resolved",
      publicKey: null,
      networkPassphrase: TESTNET,
    },
    connectedWrongNetwork: {
      status: "resolved",
      publicKey: SESSION_KEY,
      networkPassphrase: PUBLIC,
    },
    connected: {
      status: "resolved",
      publicKey: SESSION_KEY,
      networkPassphrase: TESTNET,
    },
    switchedAccount: {
      status: "resolved",
      publicKey: OTHER_KEY,
      networkPassphrase: TESTNET,
    },
  };

  function codeFor(probe: WalletProbe) {
    return evaluateWalletReadiness({
      ...probe,
      sessionPublicKey: SESSION_KEY,
      expectedNetworkPassphrase: TESTNET,
    }).code;
  }

  it("follows the wallet through connect, network switch and account switch", () => {
    assert.deepEqual(
      [
        codeFor(probes.checking),
        codeFor(probes.disconnected),
        codeFor(probes.connectedWrongNetwork),
        codeFor(probes.connected),
        codeFor(probes.switchedAccount),
        codeFor(probes.disconnected),
      ],
      [
        "checking",
        "wallet_disconnected",
        "network_mismatch",
        "ready",
        "account_mismatch",
        "wallet_disconnected",
      ]
    );
  });

  it("is a pure function of the probe", () => {
    assert.equal(codeFor(probes.connected), codeFor({ ...probes.connected }));
  });
});

describe("isRecoverableInWallet (#112)", () => {
  it("offers a re-check for states the user fixes inside Freighter", () => {
    for (const overrides of [
      { publicKey: null },
      { networkPassphrase: PUBLIC },
      { publicKey: OTHER_KEY },
    ]) {
      assert.equal(
        isRecoverableInWallet(evaluateWalletReadiness(ready(overrides))),
        true
      );
    }
  });

  it("does not offer a re-check while checking, ready, or without an extension", () => {
    for (const overrides of [{}, { status: "checking" as const }, { status: "unavailable" as const }]) {
      assert.equal(
        isRecoverableInWallet(evaluateWalletReadiness(ready(overrides))),
        false
      );
    }
  });
});

describe("network configuration helpers (#112)", () => {
  it("maps passphrases back to networks", () => {
    assert.equal(networkFromPassphrase(TESTNET), "testnet");
    assert.equal(networkFromPassphrase(PUBLIC), "public");
    assert.equal(networkFromPassphrase("nonsense"), null);
    assert.equal(networkFromPassphrase(null), null);
  });

  it("labels known networks and falls back for unknown ones", () => {
    assert.equal(describeNetwork(TESTNET), "Stellar Testnet");
    assert.equal(describeNetwork(PUBLIC), "Stellar Mainnet");
    assert.equal(describeNetwork("custom", "FUTURENET"), "FUTURENET");
    assert.equal(describeNetwork(null), "an unrecognised network");
    assert.equal(describeNetwork(null, "   "), "an unrecognised network");
  });
});
