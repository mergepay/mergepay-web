import { describe, it } from "node:test";
import assert from "node:assert";
import { SETTLEMENT_MEMO_PREFIX } from "../constants";

describe("constants", () => {
  it("defines SETTLEMENT_MEMO_PREFIX as MP:", () => {
    assert.strictEqual(SETTLEMENT_MEMO_PREFIX, "MP:");
  });
});
