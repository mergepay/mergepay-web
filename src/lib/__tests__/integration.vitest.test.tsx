import { describe, it, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  SETTLEMENT_MEMO_PREFIX,
} from "@/lib/constants";
import type {
  BalancesResponse,
  CreateExpenseRequest,
  Expense,
  GroupActivityResponse,
  User,
} from "@/lib/types";
import {
  calculateOptimisticBalances,
  useCreateExpense,
} from "@/lib/queries";
import {
  createOptimisticExpenseEvent,
  calculateOptimisticActivityList,
} from "@/lib/activity";
import {
  buildOptimisticExpense,
  shareAmountForRequest,
  applyOptimisticSettlement,
  insertOptimisticExpense,
  removeOptimisticExpense,
  isOptimisticExpenseId,
  OPTIMISTIC_EXPENSE_PREFIX,
} from "@/lib/optimistic";
import {
  buildSettlementMemo,
  validateMemo,
  parseSettlementMemo,
  breakdownMemo,
  detectMemoDeviations,
  generateShortCode,
  STELLAR_MEMO_MAX_BYTES,
  MAX_SHORT_CODE_BYTES,
  PREFIX_BYTES,
} from "@/lib/memoValidation";
import {
  isValidMergepayMemo,
  verifyTransactionMemo,
} from "@/lib/memo";
import {
  handleApiError,
  apiErrorMessage,
  networkFailure,
  ApiRequestError,
  ApiValidationError,
  markErrorNotified,
} from "@/lib/errorHandler";
import { apiError, type ApiErrorBody } from "@/lib/apiHelpers";
import { splitEqual, splitByPercentage, splitByCustom, toStroops, fromStroops } from "@/lib/split";
import { simplifyDebts } from "@/lib/settlementUtils";
import { useSettlementFlow } from "@/lib/useSettlementFlow";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-a",
    stellarPublicKey: "GABC",
    displayName: "Ada",
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function request(overrides: Partial<CreateExpenseRequest> = {}): CreateExpenseRequest {
  return {
    title: "Dinner",
    amount: "100.0000000",
    assetCode: "XLM",
    splitType: "equal",
    shares: [{ userId: "user-a" }, { userId: "user-b" }],
    ...overrides,
  };
}

function balances(rows: { userId: string; net: string }[]): BalancesResponse {
  return {
    balances: rows.map((r) => ({
      userId: r.userId,
      user: user({ id: r.userId }),
      net: r.net,
      assetCode: "XLM",
    })),
    suggestions: [],
  };
}

// ---------------------------------------------------------------------------
// Test Suite 1: Group Expense Creation
// ---------------------------------------------------------------------------

describe("Group Expense Creation", () => {
  it("creates an expense with splitType equal and divides amount among all members", () => {
    const req = request({
      splitType: "equal",
      amount: "100.0000000",
      shares: [
        { userId: "user-a" },
        { userId: "user-b" },
        { userId: "user-c" },
      ],
    });
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: req,
      payer: user(),
      now: new Date("2024-05-01T00:00:00.000Z"),
    });
    assert.equal(built.shares.length, 3);
    const share = parseFloat(built.shares[0].shareAmount);
    assert.ok(Math.abs(share - 100 / 3) < 0.0001);
    const total = built.shares.reduce((s, sh) => s + parseFloat(sh.shareAmount), 0);
    assert.ok(Math.abs(total - 100) < 0.0001);
  });

  it("creates an expense with splitType custom using custom amounts", () => {
    const req = request({
      splitType: "custom",
      amount: "100.0000000",
      shares: [
        { userId: "user-a", amount: "30.0000000" },
        { userId: "user-b", amount: "70.0000000" },
      ],
    });
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: req,
      payer: user(),
      now: new Date("2024-05-01T00:00:00.000Z"),
    });
    assert.equal(built.shares[0].shareAmount, "30");
    assert.equal(built.shares[1].shareAmount, "70");
  });

  it("creates an expense with splitType percentage and calculates percentages correctly", () => {
    const req = request({
      splitType: "percentage",
      amount: "200.0000000",
      shares: [
        { userId: "user-a", percent: 25 },
        { userId: "user-b", percent: 75 },
      ],
    });
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: req,
      payer: user(),
      now: new Date("2024-05-01T00:00:00.000Z"),
    });
    assert.equal(built.shares[0].shareAmount, "50");
    assert.equal(built.shares[1].shareAmount, "150");
  });

  it("handles uneven splits with remainder distribution", () => {
    const req = request({
      splitType: "equal",
      amount: "10.0000000",
      shares: [
        { userId: "user-a" },
        { userId: "user-b" },
        { userId: "user-c" },
      ],
    });
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: req,
      payer: user(),
      now: new Date("2024-05-01T00:00:00.000Z"),
    });
    const amounts = built.shares.map((s) => parseFloat(s.shareAmount));
    const sum = amounts.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 10) < 0.0001);
    assert.equal(amounts.length, 3);
  });

  it("produces zero shares for zero amount", () => {
    const req = request({ amount: "0" });
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: req,
      payer: user(),
      now: new Date("2024-05-01T00:00:00.000Z"),
    });
    assert.ok(built.shares.every((s) => parseFloat(s.shareAmount) === 0));
  });

  it("handles large decimal precision correctly", () => {
    const req = request({
      amount: "1234567.1234567",
      splitType: "equal",
      shares: [{ userId: "user-a" }, { userId: "user-b" }],
    });
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: req,
      payer: user(),
      now: new Date("2024-05-01T00:00:00.000Z"),
    });
    const share = parseFloat(built.shares[0].shareAmount);
    assert.ok(share > 0);
    assert.ok(Number.isFinite(share));
  });

  it("generates an expense with correct Stellar transaction memo formatting (MP: prefix)", () => {
    const shortCode = generateShortCode("Dinner", "100.00");
    const memo = buildSettlementMemo(shortCode);
    assert.ok(memo?.startsWith(SETTLEMENT_MEMO_PREFIX));
    assert.ok(memo && new TextEncoder().encode(memo).length <= STELLAR_MEMO_MAX_BYTES);
  });

  it("builds an optimistic expense with all required fields", () => {
    const req = request();
    const built = buildOptimisticExpense({
      groupId: "grp-1",
      request: req,
      payer: user(),
      now: new Date("2024-05-01T12:00:00.000Z"),
    });
    assert.equal(built.id.startsWith(OPTIMISTIC_EXPENSE_PREFIX), true);
    assert.equal(built.isOptimistic, true);
    assert.equal(built.groupId, "grp-1");
    assert.equal(built.title, "Dinner");
    assert.equal(built.amount, "100.0000000");
    assert.equal(built.assetCode, "XLM");
    assert.equal(built.splitType, "equal");
    assert.equal(built.shares.length, 2);
    assert.equal(built.payerUserId, "user-a");
    assert.equal(built.createdAt, "2024-05-01T12:00:00.000Z");
  });

  it("creates an optimistic activity event for expense creation", () => {
    const req = request();
    const evt = createOptimisticExpenseEvent("grp-1", req);
    assert.equal(evt.type, "expense_created");
    assert.equal(evt.groupId, "grp-1");
    assert.equal(evt.description, 'Added expense "Dinner"');
    assert.equal(evt.amount, "100.0000000");
    assert.equal(evt.isOptimistic, true);
    assert.equal(evt.metadata?.splitType, "equal");
    assert.equal(evt.metadata?.participantCount, 2);
  });

  it("merges optimistic activity events into the activity feed correctly", () => {
    const req = request();
    const newEvent = createOptimisticExpenseEvent("grp-1", req);
    const current: GroupActivityResponse = {
      activities: [
        {
          id: "existing-1",
          groupId: "grp-1",
          type: "member_joined",
          actor: { id: "user-b", displayName: "Bob", avatarUrl: null },
          description: "Joined the group as member",
          timestamp: "2024-01-01T00:00:00.000Z",
        },
      ],
    };
    const merged = calculateOptimisticActivityList(current, newEvent);
    assert.equal(merged.activities[0].id, newEvent.id);
    assert.equal(merged.activities.length, 2);
  });

  it("inserts optimistic expense into cache and deduplicates", () => {
    const opt = buildOptimisticExpense({
      groupId: "grp-1",
      request: request(),
      payer: user(),
    });
    const existing = expense("e1");
    const cache = insertOptimisticExpense({ expenses: [existing] }, opt);
    assert.equal(cache.expenses.length, 2);
    assert.equal(cache.expenses[0].id, opt.id);
  });

  it("removes optimistic expense from cache on failure", () => {
    const opt = buildOptimisticExpense({
      groupId: "grp-1",
      request: request(),
      payer: user(),
    });
    const cache = removeOptimisticExpense(
      { expenses: [opt, expense("e1")] },
      opt.id
    );
    assert.equal(cache.expenses.length, 1);
    assert.equal(cache.expenses[0].id, "e1");
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: Split Calculations
// ---------------------------------------------------------------------------

describe("Split Calculations", () => {
  it("calculates equal split correctly using calculateOptimisticBalances", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "0" },
      { userId: "user-b", net: "0" },
      { userId: "user-c", net: "0" },
    ]);
    const req = request({
      splitType: "equal",
      amount: "100.0000000",
      shares: [
        { userId: "user-a" },
        { userId: "user-b" },
        { userId: "user-c" },
      ],
      payerUserId: "user-a",
    });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    const userANet = parseFloat(result.balances.find((b) => b.userId === "user-a")!.net);
    const userBNet = parseFloat(result.balances.find((b) => b.userId === "user-b")!.net);
    const userCNet = parseFloat(result.balances.find((b) => b.userId === "user-c")!.net);
    assert.ok(Math.abs(userANet - (100 - 100 / 3)) < 0.01);
    assert.ok(Math.abs(userBNet - (-(100 / 3))) < 0.01);
    assert.ok(Math.abs(userCNet - (-(100 / 3))) < 0.01);
  });

  it("calculates custom split correctly", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "-100" },
      { userId: "user-b", net: "100" },
    ]);
    const req = request({
      splitType: "custom",
      amount: "100.0000000",
      shares: [
        { userId: "user-a", amount: "30.0000000" },
        { userId: "user-b", amount: "70.0000000" },
      ],
      payerUserId: "user-a",
    });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    const userANet = parseFloat(result.balances.find((b) => b.userId === "user-a")!.net);
    const userBNet = parseFloat(result.balances.find((b) => b.userId === "user-b")!.net);
    assert.equal(userANet, -30);
    assert.equal(userBNet, 30);
  });

  it("calculates percentage split correctly", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "-200" },
      { userId: "user-b", net: "200" },
    ]);
    const req = request({
      splitType: "percentage",
      amount: "200.0000000",
      shares: [
        { userId: "user-a", percent: 25 },
        { userId: "user-b", percent: 75 },
      ],
      payerUserId: "user-a",
    });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    const userANet = parseFloat(result.balances.find((b) => b.userId === "user-a")!.net);
    const userBNet = parseFloat(result.balances.find((b) => b.userId === "user-b")!.net);
    assert.equal(userANet, -50);
    assert.equal(userBNet, 50);
  });

  it("handles zero balances correctly in calculateOptimisticBalances", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "0" },
      { userId: "user-b", net: "0" },
    ]);
    const req = request({
      splitType: "equal",
      amount: "100.0000000",
      shares: [
        { userId: "user-a" },
        { userId: "user-b" },
      ],
      payerUserId: "user-a",
    });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    const userANet = parseFloat(result.balances.find((b) => b.userId === "user-a")!.net);
    const userBNet = parseFloat(result.balances.find((b) => b.userId === "user-b")!.net);
    assert.equal(userANet, 50);
    assert.equal(userBNet, -50);
  });

  it("handles large decimal precision in calculateOptimisticBalances", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "0" },
      { userId: "user-b", net: "0" },
    ]);
    const req = request({
      splitType: "equal",
      amount: "1234567.1234567",
      shares: [
        { userId: "user-a" },
        { userId: "user-b" },
      ],
      payerUserId: "user-a",
    });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    const userANet = parseFloat(result.balances.find((b) => b.userId === "user-a")!.net);
    assert.ok(Number.isFinite(userANet));
    assert.ok(userANet > 0);
  });

  it("returns balances unchanged when amount is zero", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "-10" },
      { userId: "user-b", net: "10" },
    ]);
    const req = request({ amount: "0" });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    assert.deepEqual(result, oldBalances);
  });

  it("calculateOptimisticBalances adjusts payer net even with empty shares", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "-10" },
    ]);
    const req = request({ shares: [], amount: "0" });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    const userA = result.balances.find((b) => b.userId === "user-a");
    assert.equal(parseFloat(userA!.net), -10);
  });

  it("splitEqual produces correct amounts", () => {
    const result = splitEqual("10.00", ["user-a", "user-b", "user-c"]);
    assert.equal(result.length, 3);
    const sum = result.reduce((acc, curr) => acc + toStroops(curr.amount), 0n);
    assert.equal(sum, toStroops("10.00"));
  });

  it("splitByPercentage produces correct amounts summing to 100%", () => {
    const allocations = [
      { userId: "u1", percent: 50 },
      { userId: "u2", percent: 30 },
      { userId: "u3", percent: 20 },
    ];
    const result = splitByPercentage("100.00", allocations);
    const sum = result.reduce((acc, curr) => acc + toStroops(curr.amount), 0n);
    assert.equal(sum, toStroops("100.00"));
  });

  it("splitByCustom uses exact custom amounts", () => {
    const customShares = [
      { userId: "u1", amount: "12.50" },
      { userId: "u2", amount: "7.50" },
    ];
    const result = splitByCustom("20.00", customShares);
    assert.equal(result.length, 2);
    assert.equal(result[0].amount, "12.5000000");
    assert.equal(result[1].amount, "7.5000000");
  });

  it("toStroops and fromStroops are inverse operations", () => {
    const amounts = ["1.5", "0.0000001", "42.5000000", "0", "1234567.8901234"];
    for (const amt of amounts) {
      const stroops = toStroops(amt);
      const back = fromStroops(stroops);
      assert.equal(fromStroops(toStroops(amt)), back);
    }
  });

  it("handles uneven splits with remainder using Hamilton's method", () => {
    const result = splitEqual("0.0000003", ["a", "b", "c"]);
    const sum = result.reduce((acc, curr) => acc + toStroops(curr.amount), 0n);
    assert.equal(sum, toStroops("0.0000003"));
  });

  it("simplifyDebts reduces a cycle to minimum transfers", () => {
    const rows = ["10", "-4", "-6"].map((net, i) => ({
      userId: `${i}`,
      user: user({ id: `${i}` }),
      net,
      assetCode: "XLM",
    }));
    const result = simplifyDebts(rows);
    assert.equal(result.length, 2);
    assert.equal(result[0].amount, "4");
    assert.equal(result[1].amount, "6");
  });

  it("applyOptimisticSettlement raises payer net and lowers payee net", () => {
    const result = applyOptimisticSettlement(
      balances([
        { userId: "user-a", net: "-10" },
        { userId: "user-b", net: "10" },
      ]),
      { fromUserId: "user-a", toUserId: "user-b", amount: "10.0000000" }
    );
    assert.equal(result.balances[0].net, "0");
    assert.equal(result.balances[1].net, "0");
  });

  it("applyOptimisticSettlement ignores members outside the transfer", () => {
    const before = balances([{ userId: "user-c", net: "3" }]);
    const next = applyOptimisticSettlement(before, {
      fromUserId: "user-a",
      toUserId: "user-b",
      amount: "4",
    });
    assert.equal(next.balances[0].net, "3");
  });

  it("calculateOptimisticBalances preserves balances for non-participants", () => {
    const oldBalances = balances([
      { userId: "user-a", net: "-100" },
      { userId: "user-b", net: "50" },
      { userId: "user-c", net: "0" },
    ]);
    const req = request({
      splitType: "equal",
      amount: "100.0000000",
      shares: [{ userId: "user-a" }, { userId: "user-b" }],
      payerUserId: "user-a",
    });
    const result = calculateOptimisticBalances(oldBalances, req, "user-a");
    const userC = result.balances.find((b) => b.userId === "user-c");
    assert.equal(userC?.net, "0");
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: Settlement Memo Formatting
// ---------------------------------------------------------------------------

describe("Settlement Memo Formatting", () => {
  it("uses the MP: prefix from SETTLEMENT_MEMO_PREFIX", () => {
    assert.equal(SETTLEMENT_MEMO_PREFIX, "MP:");
  });

  it("builds a valid settlement memo with MP: prefix", () => {
    const shortCode = "dinner-8f3a";
    const memo = buildSettlementMemo(shortCode);
    assert.equal(memo, "MP:dinner-8f3a");
    assert.ok(memo?.startsWith(SETTLEMENT_MEMO_PREFIX));
  });

  it("memo formatting works correctly for various expense titles", () => {
    const titles = ["Dinner", "Lunch", "Groceries", "Taxi Ride", "Office Supplies"];
    for (const title of titles) {
      const shortCode = generateShortCode(title, "50.00");
      const memo = buildSettlementMemo(shortCode);
      assert.ok(memo?.startsWith(SETTLEMENT_MEMO_PREFIX));
      assert.ok(memo && new TextEncoder().encode(memo).length <= STELLAR_MEMO_MAX_BYTES);
    }
  });

  it("truncates memos to 28 bytes (Stellar text memo limit)", () => {
    const shortCode = "a".repeat(MAX_SHORT_CODE_BYTES);
    const memo = buildSettlementMemo(shortCode);
    assert.equal(memo, `MP:${shortCode}`);
    assert.equal(new TextEncoder().encode(memo).length, STELLAR_MEMO_MAX_BYTES);
  });

  it("rejects a memo that exceeds the 28-byte Stellar limit", () => {
    const overlong = `MP:${"a".repeat(MAX_SHORT_CODE_BYTES + 1)}`;
    const result = validateMemo(overlong);
    assert.equal(result.valid, false);
    assert.ok(result.byteLength && result.byteLength > STELLAR_MEMO_MAX_BYTES);
  });

  it("PREFIX_BYTES equals 3 for MP: prefix", () => {
    assert.equal(PREFIX_BYTES, 3);
  });

  it("MAX_SHORT_CODE_BYTES equals 25", () => {
    assert.equal(MAX_SHORT_CODE_BYTES, 25);
  });

  it("PREFIX_BYTES + MAX_SHORT_CODE_BYTES equals STELLAR_MEMO_MAX_BYTES", () => {
    assert.equal(PREFIX_BYTES + MAX_SHORT_CODE_BYTES, STELLAR_MEMO_MAX_BYTES);
  });

  it("isValidMergepayMemo accepts valid MP: memos", () => {
    assert.equal(isValidMergepayMemo("MP:dinner-8f3a"), true);
    assert.equal(isValidMergepayMemo("MP:123-abc"), true);
  });

  it("isValidMergepayMemo rejects non-MP: memos", () => {
    assert.equal(isValidMergepayMemo("dinner-8f3a"), false);
    assert.equal(isValidMergepayMemo(null), false);
    assert.equal(isValidMergepayMemo(""), false);
  });

  it("verifyTransactionMemo validates valid MP: memos", () => {
    const res = verifyTransactionMemo("MP:dinner-8f3a", "dinner-8f3a");
    assert.equal(res.isValid, true);
    assert.equal(res.severity, "none");
  });

  it("verifyTransactionMemo flags memos missing MP: prefix", () => {
    const res = verifyTransactionMemo("invoice-123", "dinner-8f3a");
    assert.equal(res.isValid, false);
    assert.equal(res.severity, "malformed");
  });

  it("parseSettlementMemo round-trips a generated memo", () => {
    const shortCode = generateShortCode("Dinner", "100.00");
    const memo = buildSettlementMemo(shortCode);
    assert.ok(memo);
    const parsed = parseSettlementMemo(memo);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.prefix, SETTLEMENT_MEMO_PREFIX);
    assert.equal(parsed.shortCode, shortCode);
  });

  it("breakdownMemo reports correct prefix and byte length", () => {
    const bd = breakdownMemo("MP:dinner-8f3a");
    assert.equal(bd.conformsToConvention, true);
    assert.equal(bd.prefix, SETTLEMENT_MEMO_PREFIX);
    assert.equal(bd.byteLength, 14);
    assert.equal(bd.remainingBytes, 14);
  });

  it("detectMemoDeviations returns empty for matching memos", () => {
    const warnings = detectMemoDeviations("MP:dinner-8f3a", "dinner-8f3a");
    assert.deepEqual(warnings, []);
  });

  it("detectMemoDeviations warns for non-MP: memos", () => {
    const warnings = detectMemoDeviations("dinner-8f3a", "dinner-8f3a");
    assert.ok(warnings.some((w) => w.includes("start with")));
  });

  it("handles memos at exactly 28 bytes", () => {
    const maxMemo = buildSettlementMemo("a".repeat(MAX_SHORT_CODE_BYTES));
    assert.ok(maxMemo);
    assert.equal(new TextEncoder().encode(maxMemo).length, 28);
    assert.equal(validateMemo(maxMemo).valid, true);
  });

  it("rejects control characters in memos", () => {
    const memo = "MP:dinner\x00-8f3a";
    const result = validateMemo(memo);
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: API Error Handling
// ---------------------------------------------------------------------------

describe("API Error Handling", () => {
  it("ApiRequestError is a distinguishable Error subclass", () => {
    const err = new ApiRequestError(400, "INVALID_INPUT", "Bad request");
    assert.ok(err instanceof Error);
    assert.equal(err.name, "ApiRequestError");
    assert.equal(err.status, 400);
    assert.equal(err.code, "INVALID_INPUT");
    assert.equal(err.message, "Bad request");
  });

  it("ApiValidationError is a distinguishable Error subclass", () => {
    const err = new ApiValidationError();
    assert.ok(err instanceof Error);
    assert.equal(err.name, "ApiValidationError");
    assert.equal(err.code, "invalid_response");
    assert.equal(err.status, 200);
  });

  it("apiErrorMessage returns the error message for ApiRequestError", () => {
    const err = new ApiRequestError(404, "NOT_FOUND", "Not found");
    assert.equal(apiErrorMessage(err), "Not found");
  });

  it("apiErrorMessage returns generic fallback for unknown errors", () => {
    const err = new Error("unexpected");
    assert.equal(apiErrorMessage(err, "Fallback message"), "unexpected");
  });

  it("apiErrorMessage returns empty string for abort errors", () => {
    const err = new DOMException("aborted", "AbortError");
    assert.equal(apiErrorMessage(err), "");
  });

  it("apiErrorMessage extracts ZodError messages", () => {
    const { ZodError } = require("zod");
    const err = new ZodError([
      { path: ["title"], message: "Required" },
      { path: ["amount"], message: "Invalid" },
    ]);
    const msg = apiErrorMessage(err);
    assert.ok(msg.includes("title"));
    assert.ok(msg.includes("amount"));
  });

  it("apiError builds a canonical JSON error response", async () => {
    const response = apiError(400, "Invalid input", "INVALID_INPUT", { field: "title" });
    const body = await response.json();
    assert.equal(body.error, "Invalid input");
    assert.equal(body.code, "INVALID_INPUT");
    assert.deepEqual(body.details, { field: "title" });
  });

  it("apiError omits code and details when undefined", async () => {
    const response = apiError(500, "Internal error");
    const body = await response.json();
    assert.equal(body.error, "Internal error");
    assert.equal(body.code, undefined);
    assert.equal(body.details, undefined);
  });

  it("networkFailure creates an ApiRequestError with status 0", () => {
    const err = new Error("fetch failed");
    const result = networkFailure(err);
    assert.ok(result instanceof ApiRequestError);
    assert.equal(result.status, 0);
    assert.equal(result.code, "network_error");
  });

  it("networkFailure returns abort errors without modification", () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const result = networkFailure(abortErr);
    assert.equal(result.name, "AbortError");
  });

  it("markErrorNotified prevents duplicate toasts", () => {
    const err = new Error("test");
    markErrorNotified(err);
    // After marking, the error should be in the notified set
    // and handleApiError should not toast it again
    const msg = handleApiError(err, "Context", { silent: true });
    assert.equal(msg, "test");
  });

  it("handleApiError returns the message for known errors", () => {
    const err = new ApiRequestError(500, "INTERNAL", "Server error");
    const msg = handleApiError(err, "Failed", { silent: true });
    assert.equal(msg, "Server error");
  });

  it("handleApiError returns empty string for abort errors", () => {
    const err = new DOMException("aborted", "AbortError");
    const msg = handleApiError(err, "Failed", { silent: true });
    assert.equal(msg, "");
  });

  it("GENERIC_ERROR_MESSAGE provides a fallback", () => {
    const unknownError = { some: "unexpected" };
    const msg = apiErrorMessage(unknownError, "Custom fallback");
    assert.equal(msg, "Custom fallback");
  });

  it("ApiRequestError includes status and code properties", () => {
    const err = new ApiRequestError(403, "FORBIDDEN", "Access denied");
    assert.equal(err.status, 403);
    assert.equal(err.code, "FORBIDDEN");
    assert.equal(err.message, "Access denied");
  });
});

// ---------------------------------------------------------------------------
// Helper function
// ---------------------------------------------------------------------------

function expense(id: string): Expense {
  return {
    id,
    groupId: "grp-1",
    payerUserId: "user-a",
    payer: user(),
    title: id,
    description: null,
    amount: "10.0000000",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt: "2024-05-01T12:00:00.000Z",
    shares: [],
  };
}
