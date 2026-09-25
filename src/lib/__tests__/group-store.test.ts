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
    assert.deepStrictEqual(useGroupStore.getState().recentGroupIds, []);
  });

  it("sets and gets selectedGroupId", async () => {
    const { useGroupStore } = await import("../group-store");
    useGroupStore.getState().setSelectedGroup("group-123");
    assert.strictEqual(useGroupStore.getState().selectedGroupId, "group-123");
    assert.ok(useGroupStore.getState().recentGroupIds.includes("group-123"));
  });

  it("adds recent group IDs without duplicates", async () => {
    const { useGroupStore } = await import("../group-store");
    useGroupStore.getState().clearRecentGroups();
    useGroupStore.getState().addRecentGroup("group-1");
    useGroupStore.getState().addRecentGroup("group-2");
    useGroupStore.getState().addRecentGroup("group-1");
    assert.deepStrictEqual(useGroupStore.getState().recentGroupIds, ["group-1", "group-2"]);
  });

  it("clears selection", async () => {
    const { useGroupStore } = await import("../group-store");
    useGroupStore.getState().setSelectedGroup("group-123");
    useGroupStore.getState().clear();
    assert.strictEqual(useGroupStore.getState().selectedGroupId, null);
  });
});
