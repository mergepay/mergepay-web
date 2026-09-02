import { describe, it } from "node:test";
import assert from "node:assert";

import { anchorSupportsAsset, findAnchorForAsset } from "../anchorInfo";
import type { AnchorInfo } from "../types";

const usdcIssuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const anchors: AnchorInfo[] = [
  {
    name: "TestAnchor",
    homeDomain: "testanchor.example.com",
    assets: [
      { code: "USDC", issuer: usdcIssuer },
      { code: "XLM", issuer: null },
    ],
  },
  {
    name: "FiatOnRamp",
    homeDomain: "fiatonramp.example.com",
    assets: [{ code: "EURC", issuer: "GBEUR...ISSUER" }],
  },
];

describe("anchorSupportsAsset", () => {
  it("matches asset codes case-insensitively", () => {
    assert.strictEqual(anchorSupportsAsset(anchors[0], "usdc"), true);
    assert.strictEqual(anchorSupportsAsset(anchors[0], "USDC"), true);
  });

  it("returns false for unsupported assets", () => {
    assert.strictEqual(anchorSupportsAsset(anchors[0], "ARST"), false);
    assert.strictEqual(anchorSupportsAsset(anchors[1], "USDC"), false);
  });

  it("returns false for empty asset codes", () => {
    assert.strictEqual(anchorSupportsAsset(anchors[0], ""), false);
  });
});

describe("findAnchorForAsset", () => {
  it("returns the first anchor supporting the asset", () => {
    const found = findAnchorForAsset(anchors, "USDC");
    assert.ok(found);
    assert.strictEqual(found.name, "TestAnchor");
  });

  it("prefers a named anchor when it supports the asset", () => {
    const named = findAnchorForAsset(anchors, "USDC", "FiatOnRamp");
    // FiatOnRamp does not support USDC, so the fallback wins.
    assert.strictEqual(named.name, "TestAnchor");
  });

  it("returns null when no anchor supports the asset", () => {
    assert.strictEqual(findAnchorForAsset(anchors, "ARST"), null);
  });

  it("returns null for an empty anchor list", () => {
    assert.strictEqual(findAnchorForAsset([], "USDC"), null);
  });
});
