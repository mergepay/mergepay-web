"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useGroups } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { activeGroupIdFromPath } from "./GroupSwitcher";

/**
 * Keyboard group switcher, opened with the `G` shortcut. Built on `Dialog`, so
 * focus is trapped, Escape closes it, and focus returns where it was. The
 * current group's link is focused first and marked `aria-current="page"`.
 */
export function GroupSwitchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data, isLoading } = useGroups();
  const groups = data?.groups ?? [];
  const activeGroupId = activeGroupIdFromPath(pathname);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Switch group"
      description="Tab or Shift+Tab moves between groups, Enter opens one."
    >
      {isLoading ? (
        <p role="status" className="text-sm text-ink/60">
          Loading your groups…
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-ink/60">
          You are not in any groups yet.{" "}
          <Link href="/groups" onClick={onClose} className="font-bold underline">
            Go to Groups
          </Link>
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label="Your groups">
          {groups.map((group) => {
            const active = group.id === activeGroupId;
            return (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  data-autofocus={active ? "" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40",
                    active
                      ? "border-ink bg-butter shadow-brutal-sm"
                      : "border-transparent text-ink/80 hover:border-ink hover:bg-cream"
                  )}
                >
                  <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{group.name}</span>
                  {active && <span className="sr-only">(current group)</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
