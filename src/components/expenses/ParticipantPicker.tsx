"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Input, Label } from "@/components/ui/input";
import { filterMembers } from "@/lib/memberFilter";
import type { GroupMember } from "@/lib/types";

/**
 * Searchable participant selector for the expense split. Typing narrows the
 * list by display name or public key prefix; Arrow Up/Down move focus between
 * the visible options, Space toggles the focused one.
 */
export function ParticipantPicker({
  members,
  selected,
  onChange,
}: {
  members: GroupMember[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const visible = filterMembers(members, query);

  function toggle(userId: string) {
    onChange(
      selected.includes(userId)
        ? selected.filter((id) => id !== userId)
        : members.map((m) => m.userId).filter((id) => id === userId || selected.includes(id))
    );
  }

  function focusOption(index: number) {
    const boxes = listRef.current?.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    boxes?.[index]?.focus();
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusOption(0);
    }
  }

  function onOptionKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusOption(Math.min(index + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusOption(Math.max(index - 1, 0));
    }
  }

  return (
    <div>
      <Label htmlFor="participant-search">Split between</Label>
      <Input
        id="participant-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onSearchKeyDown}
        placeholder="Search by name or public key"
        autoComplete="off"
      />
      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60" role="status" data-testid="participant-empty">
          No members match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ul
          ref={listRef}
          className="mt-2 max-h-48 space-y-1 overflow-y-auto"
          aria-label="Participants"
        >
          {visible.map((m, i) => (
            <li key={m.userId}>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={selected.includes(m.userId)}
                  onChange={() => toggle(m.userId)}
                  onKeyDown={(e) => onOptionKeyDown(e, i)}
                />
                <span className="min-w-0 flex-1 truncate">{m.user.displayName}</span>
                {m.user.stellarPublicKey && (
                  <span className="font-mono text-[10px] text-ink/50">
                    {m.user.stellarPublicKey.slice(0, 4)}…{m.user.stellarPublicKey.slice(-4)}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
