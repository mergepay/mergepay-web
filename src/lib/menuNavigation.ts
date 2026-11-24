/**
 * Keyboard rules for popup menus (#813), following the WAI-ARIA Authoring
 * Practices "Menu Button" pattern:
 *
 * - ArrowDown / ArrowUp move between items and wrap at either end
 * - Home / End jump to the first / last item
 * - a printable character moves to the next item whose label starts with the
 *   characters typed so far (type-ahead)
 * - disabled items are skipped by all of the above
 *
 * Pure functions over item counts and labels, so the rules are unit-tested
 * without a DOM and every menu in the app navigates the same way. The DOM
 * wiring lives in `src/components/ui/dropdown-menu.tsx`.
 */

export interface MenuItemState {
  /** Visible label, used for type-ahead. */
  label: string;
  disabled?: boolean;
}

/**
 * The next enabled index from `from`, stepping by `step` and wrapping.
 * `from` may be -1 (nothing focused): stepping forward then lands on the first
 * enabled item, stepping back on the last. Returns -1 when every item is
 * disabled.
 */
export function nextEnabledIndex(items: readonly MenuItemState[], from: number, step: 1 | -1): number {
  const count = items.length;
  if (count === 0) return -1;
  let index = from < 0 ? (step === 1 ? -1 : count) : from;
  for (let i = 0; i < count; i++) {
    index = (index + step + count) % count;
    if (!items[index]?.disabled) return index;
  }
  return -1;
}

export function firstEnabledIndex(items: readonly MenuItemState[]): number {
  return nextEnabledIndex(items, -1, 1);
}

export function lastEnabledIndex(items: readonly MenuItemState[]): number {
  return nextEnabledIndex(items, -1, -1);
}

/**
 * Where a navigation key moves focus inside an open menu, or `null` when the
 * key is not a navigation key (Escape, Tab and Enter are handled by the menu).
 */
export function menuNavigationTarget(
  key: string,
  items: readonly MenuItemState[],
  current: number
): number | null {
  switch (key) {
    case "ArrowDown":
      return nextEnabledIndex(items, current, 1);
    case "ArrowUp":
      return nextEnabledIndex(items, current, -1);
    case "Home":
    case "PageUp":
      return firstEnabledIndex(items);
    case "End":
    case "PageDown":
      return lastEnabledIndex(items);
    default:
      return null;
  }
}

/** Whether a key press is a single printable character, for type-ahead. */
export function isTypeaheadKey(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): boolean {
  return event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Type-ahead: the first enabled item, searching forward from the one after
 * `current` and wrapping, whose label starts with `query` (case-insensitive).
 * A query of one repeated letter ("ccc") cycles through items starting with
 * that letter. Returns -1 when nothing matches.
 */
export function typeaheadIndex(items: readonly MenuItemState[], query: string, current: number): number {
  const q = query.toLowerCase();
  if (!q || items.length === 0) return -1;
  const repeated = q.split("").every((ch) => ch === q[0]);
  // A fresh single key, or a repeated one, moves past the current item; a
  // longer query keeps refining from it.
  const startOffset = q.length === 1 || repeated ? 1 : 0;
  const needle = repeated ? q[0] : q;
  const count = items.length;
  const start = current < 0 ? 0 : current + startOffset;
  for (let i = 0; i < count; i++) {
    const index = (start + i) % count;
    const item = items[index];
    if (item && !item.disabled && item.label.trim().toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}
