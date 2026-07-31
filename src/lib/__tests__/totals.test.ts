import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeNetsByAsset } from "../totals";

describe("summarizeNetsByAsset (#110)", () => {
  it("keeps assets apart instead of adding them together", () => {
    const totals = summarizeNetsByAsset([
      { yourNet: "10.5", netAssetCode: "USDC" },
      { yourNet: "-4", netAssetCode: "XLM" },
    ]);

    assert.deepEqual(totals, [
      { assetCode: "USDC", owed: "10.5", owe: "0", net: "10.5" },
      { assetCode: "XLM", owed: "0", owe: "4", net: "-4" },
    ]);
  });

  it("splits owed and owed-by within one asset", () => {
    const totals = summarizeNetsByAsset([
      { yourNet: "12", netAssetCode: "XLM" },
      { yourNet: "-3.5", netAssetCode: "XLM" },
    ]);

    assert.deepEqual(totals, [
      { assetCode: "XLM", owed: "12", owe: "3.5", net: "8.5" },
    ]);
  });

  it("sums stroop-exactly", () => {
    const totals = summarizeNetsByAsset([
      { yourNet: "0.1", netAssetCode: "XLM" },
      { yourNet: "0.2", netAssetCode: "XLM" },
    ]);

    assert.equal(totals[0].net, "0.3");
  });

  it("orders by gross exposure, then alphabetically", () => {
    const totals = summarizeNetsByAsset([
      { yourNet: "1", netAssetCode: "XLM" },
      { yourNet: "-50", netAssetCode: "USDC" },
      { yourNet: "1", netAssetCode: "EURC" },
    ]);

    assert.deepEqual(
      totals.map((t) => t.assetCode),
      ["USDC", "EURC", "XLM"]
    );
  });

  it("normalises asset codes before grouping", () => {
    const totals = summarizeNetsByAsset([
      { yourNet: "1", netAssetCode: "usdc" },
      { yourNet: "2", netAssetCode: "USDC" },
    ]);

    assert.equal(totals.length, 1);
    assert.deepEqual(totals[0], {
      assetCode: "USDC",
      owed: "3",
      owe: "0",
      net: "3",
    });
  });

  it("skips entries it cannot read rather than counting them as zero", () => {
    const totals = summarizeNetsByAsset([
      { yourNet: "5", netAssetCode: "XLM" },
      { yourNet: "not-a-number", netAssetCode: "XLM" },
      { yourNet: "9", netAssetCode: "" },
      { yourNet: undefined as never, netAssetCode: "XLM" },
    ]);

    assert.deepEqual(totals, [
      { assetCode: "XLM", owed: "5", owe: "0", net: "5" },
    ]);
  });

  it("returns nothing for an empty list", () => {
    assert.deepEqual(summarizeNetsByAsset([]), []);
  });
});
