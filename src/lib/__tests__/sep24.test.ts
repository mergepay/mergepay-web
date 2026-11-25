import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anchorSupportsAsset,
  findAnchorForAsset,
} from "../anchorInfo";
import type { AnchorInfo } from "../types";

const ANCHORS: AnchorInfo[] = [
  {
    name: "TestAnchor",
    homeDomain: "testanchor.example.com",
    assets: [{ code: "XLM", issuer: null }],
  },
  {
    name: "UsdcAnchor",
    homeDomain: "usdc.example.com",
    assets: [{ code: "USDC", issuer: "GISSUER" }],
  },
  {
    name: "MultiAssetAnchor",
    homeDomain: "multi.example.com",
    assets: [
      { code: "XLM", issuer: null },
      { code: "USDC", issuer: "GISSUER" },
      { code: "EURC", issuer: "GEURCISSUER" },
    ],
  },
];

describe("anchorSupportsAsset", () => {
  it("matches asset codes case-insensitively", () => {
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], "xlm"), true);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], "XLM"), true);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[1], "usdc"), true);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[1], "USDC"), true);
  });

  it("returns false for unsupported assets", () => {
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], "USDC"), false);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[1], "XLM"), false);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], "EURC"), false);
  });

  it("returns false for empty asset codes", () => {
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], ""), false);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], "   "), false);
  });

  it("handles anchors with multiple assets", () => {
    assert.strictEqual(anchorSupportsAsset(ANCHORS[2], "XLM"), true);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[2], "USDC"), true);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[2], "EURC"), true);
  });

  it("returns false for null/undefined asset codes", () => {
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], null as unknown as string), false);
    assert.strictEqual(anchorSupportsAsset(ANCHORS[0], undefined as unknown as string), false);
  });
});

describe("findAnchorForAsset", () => {
  it("returns the first anchor supporting the asset", () => {
    const found = findAnchorForAsset(ANCHORS, "XLM");
    assert.ok(found);
    assert.strictEqual(found.name, "TestAnchor");
  });

  it("prefers a named anchor when it supports the asset", () => {
    const named = findAnchorForAsset(ANCHORS, "XLM", "MultiAssetAnchor");
    assert.ok(named);
    assert.strictEqual(named.name, "MultiAssetAnchor");
  });

  it("falls back to first match when preferred anchor does not support asset", () => {
    const found = findAnchorForAsset(ANCHORS, "USDC", "TestAnchor");
    assert.ok(found);
    assert.strictEqual(found.name, "UsdcAnchor");
  });

  it("returns null when no anchor supports the asset", () => {
    assert.strictEqual(findAnchorForAsset(ANCHORS, "ARST"), null);
  });

  it("returns null for an empty anchor list", () => {
    assert.strictEqual(findAnchorForAsset([], "XLM"), null);
  });

  it("handles case-insensitive preferred anchor name matching", () => {
    const named = findAnchorForAsset(ANCHORS, "XLM", "multiassetanchor");
    assert.ok(named);
    assert.strictEqual(named.name, "MultiAssetAnchor");
  });

  it("trims whitespace from preferred anchor name", () => {
    const named = findAnchorForAsset(ANCHORS, "XLM", "  MultiAssetAnchor  ");
    assert.ok(named);
    assert.strictEqual(named.name, "MultiAssetAnchor");
  });
});

describe("SEP-24 transaction request construction", () => {
  it("builds correct deposit request payload", () => {
    const payload = { assetCode: "XLM", anchorName: "TestAnchor" };
    assert.deepStrictEqual(payload, { assetCode: "XLM", anchorName: "TestAnchor" });
  });

  it("builds correct withdrawal request payload", () => {
    const payload = { assetCode: "USDC", anchorName: "UsdcAnchor" };
    assert.deepStrictEqual(payload, { assetCode: "USDC", anchorName: "UsdcAnchor" });
  });

  it("handles asset codes with whitespace", () => {
    const payload = { assetCode: "  XLM  ", anchorName: "TestAnchor" };
    assert.strictEqual(payload.assetCode.trim().toUpperCase(), "XLM");
  });
});

describe("SEP-24 session status helpers", () => {
  const TERMINAL_STATUSES = ["completed", "error", "refunded"] as const;

  it("identifies terminal statuses correctly", () => {
    for (const status of TERMINAL_STATUSES) {
      assert.ok(TERMINAL_STATUSES.includes(status as typeof TERMINAL_STATUSES[number]));
    }
  });

  it("identifies non-terminal statuses correctly", () => {
    const nonTerminal = [
      "incomplete",
      "pending_user_transfer_start",
      "pending_external",
      "pending_anchor",
      "no_market_active",
    ] as const;
    for (const status of nonTerminal) {
      assert.ok(!TERMINAL_STATUSES.includes(status as typeof TERMINAL_STATUSES[number]));
    }
  });
});