"use client";

/**
 * Group quick-switch for the mobile navigation drawer (#611).
 *
 * On a phone the group list is one tap away at best, and the drawer is the
 * only place a persistent menu exists — so it carries the groups the user is
 * a member of. `useGroups` is the same cached query the dashboard uses, so
 * opening the drawer never triggers a second request.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { useGroups } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Keep the drawer scannable; the full list lives on `/groups`. */
const MAX_VISIBLE_GROUPS = 4;

/** Group id from a `/groups/<id>` route, or `null` anywhere else. */
export function activeGroupIdFromPath(
  pathname: string | null | undefined
): string | null {
  const match = pathname?.match(/^\/groups\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function GroupSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data, isLoading } = useGroups();

  const groups = (data?.groups ?? []).slice(0, MAX_VISIBLE_GROUPS);
  // Nothing useful to switch between yet — leave the drawer uncluttered.
  if (isLoading || groups.length === 0) return null;

  const activeGroupId = activeGroupIdFromPath(pathname);

  return (
    <div className="space-y-1.5 border-t-3 border-ink/10 px-3 pt-3">
      <p className="px-1 font-display text-[10px] uppercase tracking-widest text-ink/50">
        Your groups
      </p>
      <ul className="space-y-1">
        {groups.map((group) => {
          const active = group.id === activeGroupId;
          return (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40",
                  active
                    ? "border-ink bg-butter shadow-brutal-sm"
                    : "border-transparent text-ink/70 hover:border-ink hover:bg-cream"
                )}
              >
                <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{group.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
