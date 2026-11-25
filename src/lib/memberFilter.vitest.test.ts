import { describe, expect, it } from "vitest";
import { filterMembers } from "./memberFilter";
import type { GroupMember } from "./types";

function member(userId: string, displayName: string, key: string): GroupMember {
  return {
    id: `m-${userId}`,
    groupId: "g1",
    userId,
    role: "member",
    joinedAt: "2026-01-01T00:00:00Z",
    user: {
      id: userId,
      stellarPublicKey: key,
      displayName,
      avatarUrl: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
  } as GroupMember;
}

const members = [
  member("1", "Alice Johnson", "GABC1111"),
  member("2", "bob Stone", "GXYZ2222"),
  member("3", "Carol", "GABD3333"),
];

describe("filterMembers", () => {
  it("returns all members for a blank query", () => {
    expect(filterMembers(members, "")).toEqual(members);
    expect(filterMembers(members, "   ")).toEqual(members);
  });

  it("matches display name case-insensitively", () => {
    expect(filterMembers(members, "BOB").map((m) => m.userId)).toEqual(["2"]);
    expect(filterMembers(members, "john").map((m) => m.userId)).toEqual(["1"]);
  });

  it("matches a public key prefix case-insensitively", () => {
    expect(filterMembers(members, "gab").map((m) => m.userId)).toEqual(["1", "3"]);
    expect(filterMembers(members, "GABD").map((m) => m.userId)).toEqual(["3"]);
  });

  it("does not match the middle of a public key", () => {
    expect(filterMembers(members, "1111")).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterMembers(members, "zzz")).toEqual([]);
  });
});
