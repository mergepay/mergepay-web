import { describe, expect, it } from "vitest";
import { buildWalletAssetSummaries } from "./treasury";

/** A populated wallet: XLM native + USDC with an active trustline. */
const FUNDED = [
  {
    code: "XLM",
    issuer: null,
    name: "Lumen",
    balance: "120.5000000",
    hasTrustline: true,
  },
  {
    code: "USDC",
    issuer: "GISSUER",
    name: "USDC",
    balance: "75.0000000",
    hasTrustline: true,
  },
];

describe("buildWalletAssetSummaries (#344)", () => {
  it("returns one row per configured asset, preserving order", () => {
    const rows = buildWalletAssetSummaries(FUNDED);
    expect(rows.map((r) => r.assetCode)).toEqual(["XLM", "USDC"]);
    expect(rows.map((r) => r.balance)).toEqual(["120.5000000", "75.0000000"]);
    expect(rows.every((r) => r.hasTrustline)).toBe(true);
  });

  it("carries the issuer through, with null for native XLM", () => {
    const rows = buildWalletAssetSummaries(FUNDED);
    expect(rows[0].assetIssuer).toBeNull();
    expect(rows[1].assetIssuer).toBe("GISSUER");
  });

  it("derives the cross rate from the fiat feed (1 XLM → N USDC)", () => {
    const rows = buildWalletAssetSummaries(FUNDED, { XLM: 0.5, USDC: 2 });
    // 0.5 / 2 = 0.25 USDC per XLM.
    expect(rows[0].crossRate).toBeCloseTo(0.25, 10);
    expect(rows[0].otherAssetCode).toBe("USDC");
    // And the inverse: 2 / 0.5 = 4 XLM per USDC.
    expect(rows[1].crossRate).toBeCloseTo(4, 10);
    expect(rows[1].otherAssetCode).toBe("XLM");
  });

  it("passes the direct fiat rate through when the feed answered", () => {
    const rows = buildWalletAssetSummaries(FUNDED, { XLM: 0.5, USDC: 2 });
    expect(rows[0].fiatRate).toBe(0.5);
    expect(rows[1].fiatRate).toBe(2);
  });

  it("omits conversion figures when the feed has no answer", () => {
    const rows = buildWalletAssetSummaries(FUNDED, {});
    expect(rows.every((r) => r.fiatRate === null)).toBe(true);
    expect(rows.every((r) => r.crossRate === null)).toBe(true);
  });

  it("refuses non-positive or non-finite rates instead of dividing by them", () => {
    const zero = buildWalletAssetSummaries(FUNDED, { XLM: 0, USDC: 2 });
    expect(zero[0].crossRate).toBeNull();
    expect(zero[1].crossRate).toBeNull();

    const infinite = buildWalletAssetSummaries(FUNDED, {
      XLM: Number.POSITIVE_INFINITY,
      USDC: 2,
    });
    expect(infinite[0].fiatRate).toBeNull();
    expect(infinite[0].crossRate).toBeNull();
  });

  it("marks an asset without a trustline as not established", () => {
    const missing = [
      ...FUNDED.map((a) => ({ ...a })),
      {
        code: "EURT",
        issuer: "GOTHER",
        name: "EURT",
        balance: "0",
        hasTrustline: false,
      },
    ];
    const rows = buildWalletAssetSummaries(missing, { XLM: 0.5, USDC: 2 });
    expect(rows[2].hasTrustline).toBe(false);
  });

  it("treats null/undefined input as an empty wallet", () => {
    expect(buildWalletAssetSummaries(null)).toEqual([]);
    expect(buildWalletAssetSummaries(undefined)).toEqual([]);
  });
});
