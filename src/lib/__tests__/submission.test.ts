import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  createSubmissionGate,
  shouldSuppressSubmitKey,
  submitOnce,
} from "../submission";
import { expenseCacheKeys, invalidationFilters, qk } from "../queries";
import type { Expense } from "../types";

/** Resolves once `fn` has been scheduled — mimics an in-flight request. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSubmissionGate", () => {
  it("admits the first caller and rejects re-entry while active", () => {
    const gate = createSubmissionGate();
    assert.equal(gate.begin(), true);
    assert.equal(gate.begin(), false);
    assert.equal(gate.active, true);
  });

  it("admits again once the submission is released", () => {
    const gate = createSubmissionGate();
    gate.begin();
    gate.end();
    assert.equal(gate.active, false);
    assert.equal(gate.begin(), true);
  });
});

describe("submitOnce", () => {
  it("issues a single request for rapid repeated activation", async () => {
    const gate = createSubmissionGate();
    const request = deferred<string>();
    let calls = 0;

    // Three activations in the same tick — a double-click plus the click
    // synthesised after a mobile tap. Only the first may reach the API.
    const attempts = [
      submitOnce(gate, () => {
        calls += 1;
        return request.promise;
      }),
      submitOnce(gate, () => {
        calls += 1;
        return request.promise;
      }),
      submitOnce(gate, () => {
        calls += 1;
        return request.promise;
      }),
    ];

    assert.equal(calls, 1);
    request.resolve("expense-1");
    const results = await Promise.all(attempts);

    assert.deepEqual(results[0], { status: "success", data: "expense-1" });
    assert.equal(results[1].status, "blocked");
    assert.equal(results[2].status, "blocked");
    assert.equal(calls, 1);
  });

  it("keyboard activation shares the same gate as pointer activation", async () => {
    const gate = createSubmissionGate();
    const request = deferred<string>();
    let calls = 0;
    const activate = () =>
      submitOnce(gate, () => {
        calls += 1;
        return request.promise;
      });

    const fromPointer = activate();
    const fromEnterKey = activate();

    assert.equal((await fromEnterKey).status, "blocked");
    request.resolve("expense-1");
    assert.equal((await fromPointer).status, "success");
    assert.equal(calls, 1);
  });

  it("returns the error and releases the gate so a retry can run", async () => {
    const gate = createSubmissionGate();
    const failure = new Error("Network down");
    let calls = 0;

    const failed = await submitOnce(gate, () => {
      calls += 1;
      return Promise.reject(failure);
    });

    assert.equal(failed.status, "error");
    assert.equal(failed.status === "error" && failed.error, failure);
    assert.equal(gate.active, false);

    const retried = await submitOnce(gate, () => {
      calls += 1;
      return Promise.resolve("expense-1");
    });

    assert.deepEqual(retried, { status: "success", data: "expense-1" });
    assert.equal(calls, 2);
  });

  it("releases the gate after a successful submission", async () => {
    const gate = createSubmissionGate();
    await submitOnce(gate, () => Promise.resolve("ok"));
    assert.equal(gate.active, false);
  });
});

describe("shouldSuppressSubmitKey", () => {
  it("suppresses Enter while a request is in flight", () => {
    assert.equal(shouldSuppressSubmitKey({ key: "Enter" }, true), true);
  });

  it("suppresses auto-repeat Enter even when idle", () => {
    assert.equal(
      shouldSuppressSubmitKey({ key: "Enter", repeat: true }, false),
      true
    );
  });

  it("allows a deliberate Enter when idle", () => {
    assert.equal(
      shouldSuppressSubmitKey({ key: "Enter", repeat: false }, false),
      false
    );
  });

  it("ignores keys that do not submit the form", () => {
    assert.equal(shouldSuppressSubmitKey({ key: "a" }, true), false);
    assert.equal(shouldSuppressSubmitKey({ key: "Escape" }, true), false);
  });
});

describe("expenseCacheKeys", () => {
  const groupId = "group-1";

  const expense = (id: string): Expense =>
    ({
      id,
      groupId,
      title: `Expense ${id}`,
      amount: "10",
      assetCode: "XLM",
      createdAt: "2026-07-01T00:00:00.000Z",
      shares: [],
    }) as unknown as Expense;

  it("marks the affected group's expense, balance and ledger queries stale", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.expenses(groupId), { expenses: [expense("e-1")] });
    qc.setQueryData(qk.balances(groupId), { balances: [], suggestions: [] });
    qc.setQueryData(qk.ledger(groupId), { entries: [] });

    await Promise.all(
      expenseCacheKeys(groupId).map((target) =>
        qc.invalidateQueries(invalidationFilters(target))
      )
    );

    for (const key of [
      qk.expenses(groupId),
      qk.balances(groupId),
      qk.ledger(groupId),
    ]) {
      assert.equal(
        qc.getQueryState(key)?.isInvalidated,
        true,
        `${JSON.stringify(key)} should be invalidated`
      );
    }
  });

  it("leaves an unrelated group's cached data untouched", async () => {
    const qc = new QueryClient();
    const other = "group-2";
    qc.setQueryData(qk.expenses(other), { expenses: [expense("e-9")] });
    qc.setQueryData(qk.balances(other), { balances: [], suggestions: [] });

    await Promise.all(
      expenseCacheKeys(groupId).map((target) =>
        qc.invalidateQueries(invalidationFilters(target))
      )
    );

    assert.equal(qc.getQueryState(qk.expenses(other))?.isInvalidated, false);
    assert.equal(qc.getQueryState(qk.balances(other))?.isInvalidated, false);
  });

  it("invalidates paginated expense pages too, so no duplicate rows survive", async () => {
    const qc = new QueryClient();
    const pageKey = [...qk.expenses(groupId), "page", 20, null];
    qc.setQueryData(pageKey, { data: [expense("e-1")], nextCursor: null });

    await Promise.all(
      expenseCacheKeys(groupId).map((target) =>
        qc.invalidateQueries(invalidationFilters(target))
      )
    );

    assert.equal(qc.getQueryState(pageKey)?.isInvalidated, true);
  });

  it("refreshes the group list without sweeping every group-scoped query", async () => {
    const qc = new QueryClient();
    const other = "group-2";
    qc.setQueryData(qk.groups, { groups: [] });
    qc.setQueryData(qk.ledger(other), { entries: [] });

    await Promise.all(
      expenseCacheKeys(groupId).map((target) =>
        qc.invalidateQueries(invalidationFilters(target))
      )
    );

    assert.equal(qc.getQueryState(qk.groups)?.isInvalidated, true);
    assert.equal(qc.getQueryState(qk.ledger(other))?.isInvalidated, false);
  });
});
