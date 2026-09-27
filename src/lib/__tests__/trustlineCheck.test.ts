import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findMissingTrustlines,
  formatMissingAssetList,
  isAddableTrustline,
  summarizeTrustlines,
} from "../trustlineCheck";
import type { TrustlineAsset } from "../trustline";
import { STABLE_ASSET } from "../constants";

const ISSUER = STABLE_ASSET.issuer as string;

function asset(overrides: Partial<TrustlineAsset> = {}): TrustlineAsset {
  return {
    code: "USDC",
    issuer: ISSUER,
    name: "USD Coin",
    balance: "0.0000000",
    hasTrustline: false,
    ...overrides,
  };
}

describe("findMissingTrustlines", () => {
  it("returns only assets the wallet cannot hold", () => {
    const result = findMissingTrustlines([
      asset({ code: "XLM", issuer: null, hasTrustline: true }),
      asset({ code: "USDC", hasTrustline: true }),
      asset({ code: "ARST", hasTrustline: false }),
    ]);
    assert.deepEqual(
      result.map((a) => a.code),
      ["ARST"]
    );
  });

  it("tolerates null, undefined and empty input", () => {
    assert.deepEqual(findMissingTrustlines(null), []);
    assert.deepEqual(findMissingTrustlines(undefined), []);
    assert.deepEqual(findMissingTrustlines([]), []);
  });
});

describe("summarizeTrustlines", () => {
  it("reports ready when every asset has a trustline", () => {
    const summary = summarizeTrustlines([
      asset({ code: "XLM", issuer: null, hasTrustline: true }),
      asset({ hasTrustline: true }),
    ]);
    assert.equal(summary.status, "ready");
    assert.deepEqual(summary.missing, []);
  });

  it("reports missing with the offending assets", () => {
    const summary = summarizeTrustlines([
      asset({ hasTrustline: true }),
      asset({ code: "ARST", hasTrustline: false }),
    ]);
    assert.equal(summary.status, "missing");
    assert.deepEqual(
      summary.missing.map((a) => a.code),
      ["ARST"]
    );
  });

  it("treats an empty configured set as ready", () => {
    assert.equal(summarizeTrustlines([]).status, "ready");
    assert.equal(summarizeTrustlines(null).status, "ready");
  });
});

describe("isAddableTrustline", () => {
  it("is true only for an untrusted asset with a real issuer", () => {
    assert.equal(isAddableTrustline(asset()), true);
    assert.equal(isAddableTrustline(asset({ hasTrustline: true })), false);
    assert.equal(isAddableTrustline(asset({ issuer: null })), false);
    assert.equal(isAddableTrustline(asset({ issuer: "" })), false);
  });
});

describe("formatMissingAssetList", () => {
  it("formats one, two and many assets readably", () => {
    assert.equal(formatMissingAssetList([]), "");
    assert.equal(formatMissingAssetList([asset({ code: "USDC" })]), "USDC");
    assert.equal(
      formatMissingAssetList([asset({ code: "USDC" }), asset({ code: "ARST" })]),
      "USDC and ARST"
    );
    assert.equal(
      formatMissingAssetList([
        asset({ code: "USDC" }),
        asset({ code: "ARST" }),
        asset({ code: "EURC" }),
      ]),
      "USDC, ARST and EURC"
    );
  });
});
