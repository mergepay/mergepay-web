import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  decodeCursor,
  encodeCursor,
  fetchExpensesPage,
  parseExpensesQuery,
  sortExpensesByDateDesc,
} from "../expenses";
import type { Expense } from "../types";

function makeExpense(id: string, createdAt: string): Expense {
  return {
    id,
    groupId: "group-1",
    payerUserId: "user-1",
    payer: {
      id: "user-1",
      displayName: "Alice",
      stellarPublicKey: "G1...",
      avatarUrl: null,
      createdAt: "2026-01-01",
    },
    title: `Expense ${id}`,
    description: null,
    amount: "10",
    assetCode: "XLM",
    assetIssuer: null,
    splitType: "equal",
    memo: null,
    receiptUrl: null,
    createdAt,
    shares: [],
  };
}

describe("sortExpensesByDateDesc", () => {
  it("orders expenses with the newest first", () => {
    const expenses = [
      makeExpense("old", "2024-01-01T00:00:00.000Z"),
      makeExpense("newer", "2024-03-01T00:00:00.000Z"),
      makeExpense("newest", "2024-02-01T00:00:00.000Z"),
    ];

    const sorted = sortExpensesByDateDesc(expenses);

    assert.deepEqual(sorted.map((expense) => expense.id), ["newer", "newest", "old"]);
  });

  it("keeps equal dates in their original order", () => {
    const expenses = [
      makeExpense("first", "2024-01-01T00:00:00.000Z"),
      makeExpense("second", "2024-01-01T00:00:00.000Z"),
    ];

    const sorted = sortExpensesByDateDesc(expenses);

    assert.deepEqual(sorted.map((expense) => expense.id), ["first", "second"]);
  });
});

describe("parseExpensesQuery", () => {
  it("requires groupId", () => {
    assert.throws(
      () => parseExpensesQuery(new URLSearchParams("")),
      (err: unknown) =>
        err instanceof z.ZodError &&
        err.issues.some((i) => i.path[0] === "groupId")
    );
  });

  it("defaults limit to 20", () => {
    const params = parseExpensesQuery(new URLSearchParams("groupId=g1"));
    assert.equal(params.limit, 20);
    assert.equal(params.groupId, "g1");
    assert.equal(params.cursor, undefined);
  });

  it("coerces string limit and applies the 100-item ceiling", () => {
    assert.throws(
      () => parseExpensesQuery(new URLSearchParams("groupId=g1&limit=200")),
      (err: unknown) =>
        err instanceof z.ZodError &&
        err.issues.some((i) => i.path[0] === "limit")
    );
  });

  it("accepts limit in 1..100", () => {
    const params = parseExpensesQuery(
      new URLSearchParams("groupId=g1&limit=50")
    );
    assert.equal(params.limit, 50);
  });

  it("rejects limit < 1", () => {
    assert.throws(
      () => parseExpensesQuery(new URLSearchParams("groupId=g1&limit=0")),
      (err: unknown) => err instanceof z.ZodError
    );
  });

  it("keeps cursor as a string", () => {
    const params = parseExpensesQuery(
      new URLSearchParams("groupId=g1&cursor=abc")
    );
    assert.equal(params.cursor, "abc");
  });
});

describe("cursor codec", () => {
  it("round-trips an opaque payload", () => {
    const encoded = encodeCursor({
      createdAt: "2026-07-26T00:00:00Z",
      id: "exp-42",
    });
    const decoded = decodeCursor(encoded);
    assert.deepEqual(decoded, {
      createdAt: "2026-07-26T00:00:00Z",
      id: "exp-42",
    });
  });

  it("returns null for malformed cursors", () => {
    assert.equal(decodeCursor("not-base64-json"), null);
    assert.equal(decodeCursor(""), null);
  });

  it("returns null when the encoded payload is missing required fields", () => {
    const partial = Buffer.from(
      JSON.stringify({ id: "1" }),
      "utf8"
    ).toString("base64url");
    assert.equal(decodeCursor(partial), null);
  });
});

describe("fetchExpensesPage", () => {
  it("forwards limit and cursor to the upstream endpoint", async () => {
    let requestedUrl = "";
    const fakeFetch: typeof fetch = async (input) => {
      requestedUrl =
        typeof input === "string" ? input : (input as URL).toString();
      return new Response(
        JSON.stringify({
          expenses: [{ id: "exp-1" }, { id: "exp-2" }],
          nextCursor: "cursor-2",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };
    const page = await fetchExpensesPage(
      "g1",
      "tok",
      { limit: 25, cursor: "start" },
      "http://upstream.test",
      fakeFetch
    );
    assert.ok(requestedUrl.includes("/groups/g1/expenses"));
    assert.ok(requestedUrl.includes("limit=25"));
    assert.ok(requestedUrl.includes("cursor=start"));
    assert.equal(page.data.length, 2);
    assert.equal(page.nextCursor, "cursor-2");
  });

  it("passes the bearer token upstream", async () => {
    let capturedAuth: string | null = null;
    const fakeFetch: typeof fetch = async (_input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      capturedAuth = headers.Authorization ?? null;
      return new Response(JSON.stringify({ expenses: [] }), { status: 200 });
    };
    await fetchExpensesPage(
      "g1",
      "tok",
      { limit: 10 },
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(capturedAuth, "Bearer tok");
  });

  it("omits the Authorization header when no token is supplied", async () => {
    let capturedAuth: string | null = "sentinel";
    const fakeFetch: typeof fetch = async (_input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      capturedAuth = headers.Authorization ?? null;
      return new Response(JSON.stringify({ expenses: [] }), { status: 200 });
    };
    await fetchExpensesPage(
      "g1",
      null,
      { limit: 10 },
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(capturedAuth, null);
  });

  it("returns null nextCursor when upstream omits it (last page)", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ expenses: [] }), { status: 200 });
    const page = await fetchExpensesPage(
      "g1",
      null,
      { limit: 10 },
      "http://upstream.test",
      fakeFetch
    );
    assert.deepEqual(page.data, []);
    assert.equal(page.nextCursor, null);
  });

  it("throws on upstream failure", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("nope", { status: 500 });
    await assert.rejects(
      fetchExpensesPage(
        "g1",
        null,
        { limit: 10 },
        "http://upstream.test",
        fakeFetch
      )
    );
  });

  /**
   * Walks the pagination contract end-to-end: drive `fetchExpensesPage`
   * with a stateful stub that hands out pages until `nextCursor` is
   * null, and verify the upstream requests carry the cursor forward
   * and that items are concatenated without overlap or loss.
   */
  it("walks multiple pages consistently", async () => {
    // Build a deterministic dataset of 5 expenses.
    const all: Expense[] = Array.from({ length: 5 }, (_, i) => ({
      id: `exp-${i + 1}`,
      groupId: "g1",
      payerUserId: "user-1",
      payer: {
        id: "user-1",
        displayName: "Alice",
        stellarPublicKey: "G1",
        avatarUrl: null,
        createdAt: "2026-07-01T00:00:00Z",
      },
      title: `Expense ${i + 1}`,
      description: null,
      amount: "10",
      assetCode: "XLM",
      assetIssuer: null,
      splitType: "equal",
      memo: null,
      receiptUrl: null,
      createdAt: `2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      shares: [],
    }));

    // Stub: each page returns up to 2 items and an opaque cursor that
    // points at the cut-off index, until exhausted.
    const cursorsSeen: Array<string | undefined> = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const cursor = url.searchParams.get("cursor");
      cursorsSeen.push(cursor ?? undefined);

      const startIdx = cursor
        ? decodeCursor(cursor)
          ? all.findIndex((e) => e.id === decodeCursor(cursor)!.id) + 1
          : all.length
        : 0;
      const endIdx = Math.min(startIdx + limit, all.length);
      const slice = all.slice(startIdx, endIdx);
      const nextCursor =
        endIdx < all.length
          ? encodeCursor({
              createdAt: slice[slice.length - 1]!.createdAt,
              id: slice[slice.length - 1]!.id,
            })
          : null;

      return new Response(
        JSON.stringify({ expenses: slice, nextCursor }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    // Page 1: no cursor, limit 2
    const p1 = await fetchExpensesPage(
      "g1",
      null,
      { limit: 2 },
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(cursorsSeen[0], undefined);
    assert.equal(p1.data.length, 2);
    assert.equal(p1.data[0]?.id, "exp-1");
    assert.equal(p1.data[1]?.id, "exp-2");
    assert.ok(p1.nextCursor);

    // Page 2: cursor from page 1
    const p2 = await fetchExpensesPage(
      "g1",
      null,
      { limit: 2, cursor: p1.nextCursor! },
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(cursorsSeen[1], p1.nextCursor);
    assert.equal(p2.data.length, 2);
    assert.equal(p2.data[0]?.id, "exp-3");
    assert.equal(p2.data[1]?.id, "exp-4");
    assert.ok(p2.nextCursor);

    // Page 3: last page, returns null nextCursor
    const p3 = await fetchExpensesPage(
      "g1",
      null,
      { limit: 2, cursor: p2.nextCursor! },
      "http://upstream.test",
      fakeFetch
    );
    assert.equal(p3.data.length, 1);
    assert.equal(p3.data[0]?.id, "exp-5");
    assert.equal(p3.nextCursor, null);

    // Consistency invariant: concatenating all pages reproduces the
    // original dataset with no overlap or loss.
    const walked = [...p1.data, ...p2.data, ...p3.data];
    assert.deepEqual(
      walked.map((e) => e.id),
      all.map((e) => e.id)
    );
  });
});
