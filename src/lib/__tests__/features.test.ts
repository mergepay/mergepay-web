import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkAccountHasTrustline, isAssetNative } from "../../components/TrustlineDialog";
import { computeNextRunDate } from "../../components/RecurringExpenseScheduler";
import { buildFilteredExpenseExportJson } from "../export";
import type { Expense } from "../types";

describe("Trustline verification helper", () => {
  it("recognizes native XLM assets without trustlines", () => {
    assert.equal(isAssetNative("XLM"), true);
    assert.equal(isAssetNative("native"), true);
    assert.equal(isAssetNative("USDC"), false);
  });

  it("checks whether an account balances array holds the required trustline", () => {
    const balances = [
      { asset_type: "native" },
      {
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      },
    ];

    assert.equal(
      checkAccountHasTrustline(
        balances,
        "USDC",
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
      ),
      true
    );

    assert.equal(
      checkAccountHasTrustline(
        balances,
        "EURC",
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
      ),
      false
    );

    assert.equal(
      checkAccountHasTrustline(
        balances,
        "USDC",
        "GOTHERISSUER"
      ),
      false
    );
  });
});

describe("Recurring expense schedule calculations", () => {
  it("calculates next recurrence run date correctly", () => {
    const base = new Date(Date.now() - 1000 * 60 * 60 * 24 * 8); // 8 days ago
    const nextWeekly = computeNextRunDate(base, "weekly");
    assert.ok(nextWeekly > new Date());

    const nextMonthly = computeNextRunDate(base, "monthly");
    assert.ok(nextMonthly > new Date());
  });
});

describe("Expense JSON export filtering", () => {
  const dummyExpenses: Expense[] = [
    {
      id: "exp-1",
      groupId: "g-1",
      payerUserId: "u-1",
      payer: { id: "u-1", stellarPublicKey: "G1", displayName: "Alice", avatarUrl: null, createdAt: "" },
      title: "Grocery",
      description: null,
      amount: "50.0000000",
      assetCode: "USDC",
      assetIssuer: null,
      splitType: "equal",
      memo: null,
      receiptUrl: null,
      createdAt: "2026-08-01T12:00:00Z",
      shares: [],
    },
    {
      id: "exp-2",
      groupId: "g-1",
      payerUserId: "u-1",
      payer: { id: "u-1", stellarPublicKey: "G1", displayName: "Alice", avatarUrl: null, createdAt: "" },
      title: "Rent",
      description: null,
      amount: "500.0000000",
      assetCode: "USDC",
      assetIssuer: null,
      splitType: "equal",
      memo: null,
      receiptUrl: null,
      createdAt: "2026-08-20T12:00:00Z",
      shares: [],
    },
  ];

  it("filters exported expenses within start and end date bounds", () => {
    const jsonStr = buildFilteredExpenseExportJson(dummyExpenses, {
      startDate: "2026-08-10",
      endDate: "2026-08-25",
    });
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "Rent");
  });
});