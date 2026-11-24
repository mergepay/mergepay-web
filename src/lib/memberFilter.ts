import type { GroupMember } from "./types";

/**
 * Case-insensitive member search used by the expense participant picker.
 * Matches a substring of the display name or a prefix of the Stellar public
 * key. A blank query returns every member, in the original order.
 */
export function filterMembers(members: GroupMember[], query: string): GroupMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter(
    (m) =>
      (m.user.displayName ?? "").toLowerCase().includes(q) ||
      (m.user.stellarPublicKey ?? "").toLowerCase().startsWith(q)
  );
}
