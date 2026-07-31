import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canBrowseReadOnly,
  deriveWalletStatus,
  networkDisplayName,
  walletGateReason,
  type ExpectedNetwork,
  type WalletProbe,
  type WalletStatusKind,
} from "../walletStatus";

const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

const PUBLIC_APP: ExpectedNetwork = {
  networkPassphrase: PUBLIC_PASSPHRASE,
  network: "public",
};
const TESTNET_APP: ExpectedNetwork = {
  networkPassphrase: TESTNET_PASSPHRASE,
  network: "testnet",
};

const ADDRESS = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

function probe(overrides: Partial<WalletProbe> = {}): WalletProbe {
  return {
    available: true,
    address: ADDRESS,
    networkPassphrase: PUBLIC_PASSPHRASE,
    networkName: "PUBLIC",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

describe("deriveWalletStatus", () => {
  const cases: {
    name: string;
    probe: WalletProbe;
    expected: ExpectedNetwork;
    kind: WalletStatusKind;
    canSign: boolean;
    action: string | null;
  }[] = [
    {
      name: "availability not determined yet",
      probe: probe({ available: null, address: null, networkPassphrase: null, networkName: null }),
      expected: PUBLIC_APP,
      kind: "checking",
      canSign: false,
      action: null,
    },
    {
      name: "extension not installed",
      probe: probe({ available: false, address: null, networkPassphrase: null, networkName: null }),
      expected: PUBLIC_APP,
      kind: "unavailable",
      canSign: false,
      action: "install",
    },
    {
      name: "installed but no account granted",
      probe: probe({ address: null }),
      expected: PUBLIC_APP,
      kind: "disconnected",
      canSign: false,
      action: "connect",
    },
    {
      name: "granted an empty address",
      probe: probe({ address: "" }),
      expected: PUBLIC_APP,
      kind: "disconnected",
      canSign: false,
      action: "connect",
    },
    {
      name: "wallet on testnet while the app targets mainnet",
      probe: probe({ networkPassphrase: TESTNET_PASSPHRASE, networkName: "TESTNET" }),
      expected: PUBLIC_APP,
      kind: "network_mismatch",
      canSign: false,
      action: "switch_network",
    },
    {
      name: "wallet on mainnet while the app targets testnet",
      probe: probe({ networkPassphrase: PUBLIC_PASSPHRASE, networkName: "PUBLIC" }),
      expected: TESTNET_APP,
      kind: "network_mismatch",
      canSign: false,
      action: "switch_network",
    },
    {
      name: "connected on the configured network",
      probe: probe(),
      expected: PUBLIC_APP,
      kind: "connected",
      canSign: true,
      action: null,
    },
    {
      name: "connected on testnet when the app targets testnet",
      probe: probe({ networkPassphrase: TESTNET_PASSPHRASE, networkName: "TESTNET" }),
      expected: TESTNET_APP,
      kind: "connected",
      canSign: true,
      action: null,
    },
    {
      name: "network unreadable — the wallet still enforces it at signing time",
      probe: probe({ networkPassphrase: null, networkName: null }),
      expected: PUBLIC_APP,
      kind: "connected",
      canSign: true,
      action: null,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const status = deriveWalletStatus(c.probe, c.expected);
      assert.equal(status.kind, c.kind);
      assert.equal(status.canSign, c.canSign);
      assert.equal(status.actionKind, c.action);
    });
  }

  it("gives every state a distinct user-facing message", () => {
    const messages = cases.map((c) => deriveWalletStatus(c.probe, c.expected).message);
    const byKind = new Map<WalletStatusKind, Set<string>>();
    cases.forEach((c, i) => {
      const set = byKind.get(c.kind) ?? new Set();
      set.add(messages[i]);
      byKind.set(c.kind, set);
    });
    // Every distinct kind must have copy that no other kind uses.
    const seen = new Map<string, WalletStatusKind>();
    for (const [kind, set] of byKind) {
      for (const message of set) {
        const owner = seen.get(message);
        assert.ok(
          owner === undefined || owner === kind,
          `"${message}" is shared by ${owner} and ${kind}`
        );
        seen.set(message, kind);
      }
    }
  });

  it("offers a recovery action for every state that blocks signing", () => {
    for (const c of cases) {
      const status = deriveWalletStatus(c.probe, c.expected);
      if (status.canSign || status.kind === "checking") continue;
      assert.ok(
        status.actionKind && status.actionLabel,
        `${status.kind} should offer a recovery action`
      );
    }
  });

  it("names the network the wallet is actually on in a mismatch", () => {
    const status = deriveWalletStatus(
      probe({ networkPassphrase: TESTNET_PASSPHRASE, networkName: "TESTNET" }),
      PUBLIC_APP
    );
    assert.match(status.message, /TESTNET/);
    assert.match(status.message, /Stellar mainnet/);
  });

  it("still reads sensibly when the mismatched network has no name", () => {
    const status = deriveWalletStatus(
      probe({ networkPassphrase: "Some Other Network", networkName: null }),
      PUBLIC_APP
    );
    assert.equal(status.kind, "network_mismatch");
    assert.doesNotMatch(status.message, /null|undefined/);
  });

  it("echoes back only the public address, never other wallet data", () => {
    const status = deriveWalletStatus(probe(), PUBLIC_APP);
    assert.equal(status.address, ADDRESS);
    assert.deepEqual(Object.keys(status).sort(), [
      "actionKind",
      "actionLabel",
      "address",
      "canSign",
      "kind",
      "label",
      "message",
      "networkName",
      "tone",
    ]);
  });

  it("does not expose an address before one is granted", () => {
    for (const p of [
      probe({ available: null, address: null }),
      probe({ available: false, address: null }),
      probe({ address: null }),
    ]) {
      assert.equal(deriveWalletStatus(p, PUBLIC_APP).address, null);
    }
  });
});

// ---------------------------------------------------------------------------
// Action gating
// ---------------------------------------------------------------------------

describe("walletGateReason", () => {
  it("returns null when the wallet is ready to sign", () => {
    assert.equal(walletGateReason(deriveWalletStatus(probe(), PUBLIC_APP)), null);
  });

  const blocked: { name: string; probe: WalletProbe }[] = [
    { name: "still checking", probe: probe({ available: null, address: null }) },
    { name: "missing wallet access", probe: probe({ available: false, address: null }) },
    { name: "not connected", probe: probe({ address: null }) },
    {
      name: "configured network mismatch",
      probe: probe({ networkPassphrase: TESTNET_PASSPHRASE, networkName: "TESTNET" }),
    },
  ];

  for (const c of blocked) {
    it(`explains the block when ${c.name}`, () => {
      const status = deriveWalletStatus(c.probe, PUBLIC_APP);
      const reason = walletGateReason(status);
      assert.ok(reason, "expected a reason");
      assert.equal(reason, status.message);
    });
  }
});

describe("canBrowseReadOnly", () => {
  it("never blocks read-only browsing, whatever the wallet state", () => {
    for (const p of [
      probe({ available: null, address: null }),
      probe({ available: false, address: null }),
      probe({ address: null }),
      probe({ networkPassphrase: TESTNET_PASSPHRASE }),
      probe(),
    ]) {
      assert.equal(canBrowseReadOnly(deriveWalletStatus(p, PUBLIC_APP)), true);
    }
  });
});

describe("networkDisplayName", () => {
  it("names the configured networks", () => {
    assert.equal(networkDisplayName("public"), "Stellar mainnet");
    assert.equal(networkDisplayName("testnet"), "Stellar testnet");
  });

  it("treats anything that is not public as a test network", () => {
    assert.equal(networkDisplayName("futurenet"), "Stellar testnet");
  });
});
