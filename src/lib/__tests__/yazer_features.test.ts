import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseExpenseDeepLink, buildExpenseShareUrl } from "../deepLink";
import { simulateStellarTransaction } from "../../components/FeeSimulationBadge";

describe("DeepLink Parser & Builder (Issue #232)", () => {
  it("parses valid query parameters correctly", () => {
    const params = new URLSearchParams({
      title: "Dinner Party",
      amount: "50.5",
      asset: "USDC",
      memo: "Food and drinks",
    });

    const parsed = parseExpenseDeepLink(params);
    assert.ok(parsed);
    assert.equal(parsed?.title, "Dinner Party");
    assert.equal(parsed?.amount, "50.5");
    assert.equal(parsed?.asset, "USDC");
    assert.equal(parsed?.memo, "Food and drinks");
  });

  it("handles empty or invalid query parameters gracefully", () => {
    const params = new URLSearchParams({
      amount: "invalid-amount",
    });

    const parsed = parseExpenseDeepLink(params);
    assert.equal(parsed, null);
  });

  it("builds valid expense share URLs", () => {
    const url = buildExpenseShareUrl("https://mergepay.app", "grp-123", {
      title: "Groceries",
      amount: "25",
      asset: "XLM",
    });

    assert.ok(url.includes("/groups/grp-123"));
    assert.ok(url.includes("title=Groceries"));
    assert.ok(url.includes("amount=25"));
    assert.ok(url.includes("asset=XLM"));
  });
});

describe("Transaction Simulation & Gas Fee Estimation (Issue #234)", () => {
  it("calculates base and resource fees for valid XLM amounts", () => {
    const sim = simulateStellarTransaction("10.0", 1);
    assert.equal(sim.successful, true);
    assert.equal(sim.minResourceFeeStroops, "100");
    assert.equal(sim.recommendedFeeStroops, "250");
    assert.ok(sim.cpuInstructions > 0);
  });

  it("scales fees based on operation count", () => {
    const sim = simulateStellarTransaction("10.0", 3);
    assert.equal(sim.successful, true);
    assert.equal(sim.minResourceFeeStroops, "300");
    assert.equal(sim.recommendedFeeStroops, "750");
  });

  it("returns failure simulation for zero or invalid amount", () => {
    const sim = simulateStellarTransaction("0", 1);
    assert.equal(sim.successful, false);
    assert.ok(sim.errorMessage);
  });
});