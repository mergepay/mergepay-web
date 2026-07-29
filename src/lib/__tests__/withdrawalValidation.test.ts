import { describe, it } from "node:test";
import assert from "node:assert";
import {
  fromStroops,
  withdrawalBalanceError,
  TREASURY_WITHDRAW_FEE_STROOPS,
} from "../money";

describe("fromStroops", () => {
  it("converts whole amounts", () => {
    assert.strictEqual(fromStroops(10_000_000n), "1");
    assert.strictEqual(fromStroops(0n), "0");
  });

  it("converts fractional amounts and strips trailing zeros", () => {
    assert.strictEqual(fromStroops(15_000_000n), "1.5");
    assert.strictEqual(fromStroops(100n), "0.00001");
    assert.strictEqual(fromStroops(1n), "0.0000001");
  });

  it("handles negatives", () => {
    assert.strictEqual(fromStroops(-15_000_000n), "-1.5");
  });
});

describe("withdrawalBalanceError", () => {
  it("returns null when the balance is still unknown (loading)", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "5",
        balanceRaw: undefined,
        assetCode: "XLM",
      }),
      null
    );
  });

  it("returns null for empty, invalid, or zero amounts", () => {
    for (const amountRaw of ["", "abc", "0", "-3", "0.00000001"]) {
      assert.strictEqual(
        withdrawalBalanceError({
          amountRaw,
          balanceRaw: "10",
          assetCode: "XLM",
        }),
        null,
        `amount "${amountRaw}" should be ignored`
      );
    }
  });

  it("returns null when the XLM amount plus fee fits the balance", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "5",
        balanceRaw: "10",
        assetCode: "XLM",
      }),
      null
    );
  });

  it("returns null when the balance is exactly amount + fee", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "10",
        balanceRaw: "10.00001",
        assetCode: "XLM",
      }),
      null
    );
  });

  it("flags an XLM amount that exceeds the balance", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "11",
        balanceRaw: "10",
        assetCode: "XLM",
      }),
      "Insufficient balance. Available: 10 XLM."
    );
  });

  it("flags an empty treasury balance", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "1",
        balanceRaw: "0",
        assetCode: "XLM",
      }),
      "Insufficient balance. Available: 0 XLM."
    );
  });

  it("flags an XLM amount that fits but leaves nothing for the fee", () => {
    // amount == balance → shortfall is exactly the fee (100 stroops).
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "10",
        balanceRaw: "10",
        assetCode: "XLM",
      }),
      "Insufficient balance (need 0.00001 XLM more for fee)."
    );
  });

  it("reports the exact fee shortfall at stroop precision", () => {
    // amount + fee exceeds balance by 50 stroops.
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "10.0000050",
        balanceRaw: "10.0000100",
        assetCode: "XLM",
      }),
      "Insufficient balance (need 0.000005 XLM more for fee)."
    );
  });

  it("does not flag a USDC amount within balance when XLM covers the fee", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "25",
        balanceRaw: "25",
        assetCode: "USDC",
        nativeBalanceRaw: "1",
      }),
      null
    );
  });

  it("flags a USDC amount above balance", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "26",
        balanceRaw: "25",
        assetCode: "USDC",
        nativeBalanceRaw: "1",
      }),
      "Insufficient balance. Available: 25 USDC."
    );
  });

  it("flags a USDC withdrawal when the XLM balance cannot pay the fee", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "25",
        balanceRaw: "25",
        assetCode: "USDC",
        nativeBalanceRaw: "0",
      }),
      "Insufficient XLM for the network fee (need about 0.00001 XLM)."
    );
  });

  it("skips the USDC fee check while the XLM balance is unknown", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "25",
        balanceRaw: "25",
        assetCode: "USDC",
      }),
      null
    );
  });

  it("honors a custom fee estimate", () => {
    const feeStroops = 1_000_000n; // 0.1 XLM
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "10",
        balanceRaw: "10.05",
        assetCode: "XLM",
        feeStroops,
      }),
      "Insufficient balance (need 0.05 XLM more for fee)."
    );
    assert.ok(TREASURY_WITHDRAW_FEE_STROOPS < feeStroops);
  });

  it("returns null for unparseable balances instead of crying wolf", () => {
    assert.strictEqual(
      withdrawalBalanceError({
        amountRaw: "5",
        balanceRaw: "not-a-number",
        assetCode: "XLM",
      }),
      null
    );
  });
});
