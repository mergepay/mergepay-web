import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

describe("Group store", () => {
  beforeEach(() => {
    try {
      localStorage.removeItem("mergepay.selectedGroup");
    } catch {}
  });

  it("starts with no selection when storage is empty", async () => {
    const { useGroupStore } = await import("../group-store");
    assert.strictEqual(useGroupStore.getState().selectedGroupId, null);
  });

  it("sets and gets selectedGroupId", async () => {
    const { useGroupStore } = await import("../group-store");
    useGroupStore.getState().setSelectedGroup("group-123");
    assert.strictEqual(useGroupStore.getState().selectedGroupId, "group-123");
  });

  it("clears selection", async () => {
    const { useGroupStore } = await import("../group-store");
    useGroupStore.getState().setSelectedGroup("group-123");
    useGroupStore.getState().clear();
    assert.strictEqual(useGroupStore.getState().selectedGroupId, null);
  });
});
