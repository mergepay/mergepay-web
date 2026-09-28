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

describe("orderGroupsByActive (#494)", () => {
  const groups = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];

  it("hoists the persisted selection to the front", async () => {
    const { orderGroupsByActive } = await import("../group-store");
    assert.deepStrictEqual(
      orderGroupsByActive(groups, "c").map((g) => g.id),
      ["c", "a", "b"]
    );
  });

  it("keeps the order when the active group is already first", async () => {
    const { orderGroupsByActive } = await import("../group-store");
    assert.deepStrictEqual(
      orderGroupsByActive(groups, "a").map((g) => g.id),
      ["a", "b", "c"]
    );
  });

  it("returns the input unchanged for a missing or unknown selection", async () => {
    const { orderGroupsByActive } = await import("../group-store");
    assert.deepStrictEqual(orderGroupsByActive(groups, null), groups);
    assert.deepStrictEqual(orderGroupsByActive(groups, undefined), groups);
    assert.deepStrictEqual(orderGroupsByActive(groups, "nope"), groups);
    assert.deepStrictEqual(orderGroupsByActive([], "a"), []);
  });
});
