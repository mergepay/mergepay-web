import { describe, expect, it } from "vitest";

import {
  addDecimal,
  aggregateTreasury,
  compareDecimal,
} from "../treasury";

const XLM = { assetCode: "XLM", assetIssuer: null };
const USDC = {
  assetCode: "USDC",
  assetIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

describe("addDecimal", () => {
  it("sums without floating-point drift", () => {
    expect(addDecimal("0.1", "0.2")).toBe("0.3");
  });

  it("adds whole numbers cleanly", () => {
    expect(addDecimal("100", "50")).toBe("150");
  });

  it("handles empty / missing operands", () => {
    expect(addDecimal("", "")).toBe("0");
    expect(addDecimal("10", "")).toBe("10");
  });

  it("normalises trailing fractional zeros", () => {
    expect(addDecimal("1.5000000", "1.5")).toBe("3");
  });
});

describe("compareDecimal", () => {
  it("orders correctly", () => {
    expect(compareDecimal("5", "10")).toBe(-1);
    expect(compareDecimal("10", "5")).toBe(1);
    expect(compareDecimal("7", "7")).toBe(0);
    expect(compareDecimal("0.3", "0.20")).toBe(1);
  });
});

describe("aggregateTreasury", () => {
  it("sums across groups by asset code", () => {
    const agg = aggregateTreasury([
      {
        groupId: "g1",
        groupName: "Trip",
        balances: [
          { assetCode: "XLM", assetIssuer: null, balance: "10.5" },
          { assetCode: "USDC", assetIssuer: USDC.assetIssuer, balance: "25" },
        ],
      },
      {
        groupId: "g2",
        groupName: "Rent",
        balances: [
          { assetCode: "XLM", assetIssuer: null, balance: "2.5" },
        ],
      },
    ]);

    expect(agg.treasuryCount).toBe(2);
    expect(agg.assets).toHaveLength(2);

    const xlm = agg.assets.find((a) => a.assetCode === "XLM")!;
    expect(xlm.total).toBe("13"); // 10.5 + 2.5
    expect(xlm.fundedTreasuries).toBe(2);

    const usdc = agg.assets.find((a) => a.assetCode === "USDC")!;
    expect(usdc.total).toBe("25");
    expect(usdc.fundedTreasuries).toBe(1);
  });

  it("never sums XLM and USDC together", () => {
    const agg = aggregateTreasury([
      {
        groupId: "g1",
        groupName: "Trip",
        balances: [
          { assetCode: "XLM", assetIssuer: null, balance: "10" },
          { assetCode: "USDC", assetIssuer: USDC.assetIssuer, balance: "5" },
        ],
      },
    ]);

    expect(agg.assets).toHaveLength(2);
    const xlm = agg.assets.find((a) => a.assetCode === "XLM")!;
    expect(xlm.total).toBe("10");
    const usdc = agg.assets.find((a) => a.assetCode === "USDC")!;
    expect(usdc.total).toBe("5");
  });

  it("treats a missing trustline / zero balance gracefully", () => {
    // No XLM balance row at all + an explicit zero USDC.
    const agg = aggregateTreasury([
      {
        groupId: "g1",
        groupName: "Trip",
        balances: [
          { assetCode: "USDC", assetIssuer: USDC.assetIssuer, balance: "0" },
        ],
      },
    ]);

    expect(agg.assets).toHaveLength(0);
    expect(agg.allZero).toBe(true);
  });

  it("reports allZero when everything is zero", () => {
    const agg = aggregateTreasury([
      {
        groupId: "g1",
        groupName: "Trip",
        balances: [{ assetCode: "XLM", assetIssuer: null, balance: "0" }],
      },
    ]);
    expect(agg.assets).toHaveLength(0);
    expect(agg.allZero).toBe(true);
  });

  it("sorts assets by total descending", () => {
    const agg = aggregateTreasury([
      {
        groupId: "g1",
        groupName: "Trip",
        balances: [
          { assetCode: "XLM", assetIssuer: null, balance: "10" },
          { assetCode: "USDC", assetIssuer: USDC.assetIssuer, balance: "50" },
        ],
      },
    ]);
    expect(agg.assets[0].assetCode).toBe("USDC");
    expect(agg.assets[1].assetCode).toBe("XLM");
  });

  it("returns empty assets for no sources", () => {
    const agg = aggregateTreasury([]);
    expect(agg.assets).toHaveLength(0);
    expect(agg.treasuryCount).toBe(0);
  });
});