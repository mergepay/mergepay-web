/**
 * Global keyboard shortcuts: the single source of truth for what each
 * shortcut is, when it fires, and how it is documented in the cheat sheet.
 *
 * Pure rules live here so they can be unit-tested without React; the DOM
 * listener is `src/components/KeyboardShortcuts.tsx` and pages attach the
 * actual behaviour with `useShortcut(id, handler)`.
 *
 * Accessibility rules (WCAG 2.1.1 / 2.1.4):
 * - A shortcut never fires while the user is typing in a field, select,
 *   contenteditable region, or while focus is inside a menu/listbox, so
 *   standard typing and widget keyboard navigation are never hijacked.
 * - A shortcut never fires while a modal dialog is open (the dialog owns the
 *   keyboard), except the cheat sheet's own toggle.
 * - Single-character shortcuts can be turned off from the cheat sheet
 *   (WCAG 2.1.4 Character Key Shortcuts); modifier shortcuts stay on.
 */

export type ShortcutId =
  | "show-help"
  | "command-palette"
  | "new-expense"
  | "switch-group"
  | "wallet-login";

export interface ShortcutDefinition {
  id: ShortcutId;
  /** Keys as shown to the user, one entry per key cap. */
  keys: readonly string[];
  description: string;
  /** Where the shortcut is available, shown in the cheat sheet. */
  where: string;
  /** True for a single printable key with no Ctrl/⌘/Alt (can be disabled). */
  singleKey: boolean;
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: "show-help", keys: ["?"], description: "Show keyboard shortcuts", where: "Anywhere", singleKey: true },
  {
    id: "command-palette",
    keys: ["Ctrl / ⌘", "K"],
    description: "Open the command palette",
    where: "Signed-in pages",
    singleKey: false,
  },
  { id: "new-expense", keys: ["N"], description: "Add an expense", where: "A group's page", singleKey: true },
  { id: "switch-group", keys: ["G"], description: "Switch group", where: "Signed-in pages", singleKey: true },
  { id: "wallet-login", keys: ["W"], description: "Connect Freighter wallet", where: "Sign-in page", singleKey: true },
];

/**
 * Elements whose own keyboard handling must win: text entry, and composite
 * widgets that use letter keys for type-ahead (menus, listboxes, comboboxes).
 */
const EDITABLE_SELECTOR = [
  "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio])",
  "textarea",
  "select",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='menu'] *",
  "[role='menu']",
  "[role='listbox'] *",
  "[role='listbox']",
].join(", ");

export function isEditableTarget(element: Element | null): boolean {
  if (!element || !(element instanceof Element)) return false;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return element.matches(EDITABLE_SELECTOR);
}

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

/**
 * Which shortcut a key press means, or null. Only the shortcuts this listener
 * owns are matched; Ctrl/⌘+K is handled by the app shell and only documented.
 */
export function matchShortcut(event: ShortcutKeyEvent): ShortcutId | null {
  if (event.repeat || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === "?") return "show-help";
  if (event.shiftKey) return null;
  switch (event.key.toLowerCase()) {
    case "n":
      return "new-expense";
    case "g":
      return "switch-group";
    case "w":
      return "wallet-login";
    default:
      return null;
  }
}

export function getShortcut(id: ShortcutId): ShortcutDefinition {
  const found = SHORTCUTS.find((shortcut) => shortcut.id === id);
  if (!found) throw new Error(`Unknown shortcut ${id}`);
  return found;
}

// --- handler registry -------------------------------------------------------

type Handler = () => void;

/** Most recent registration wins, so a nested page can override a layout. */
const handlers = new Map<ShortcutId, Handler[]>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function registerShortcutHandler(id: ShortcutId, handler: Handler): () => void {
  const list = handlers.get(id) ?? [];
  list.push(handler);
  handlers.set(id, list);
  notify();
  return () => {
    const current = handlers.get(id);
    if (!current) return;
    const index = current.lastIndexOf(handler);
    if (index !== -1) current.splice(index, 1);
    if (current.length === 0) handlers.delete(id);
    notify();
  };
}

export function hasShortcutHandler(id: ShortcutId): boolean {
  return (handlers.get(id)?.length ?? 0) > 0;
}

/** Runs the active handler. Returns false when nothing on this page handles it. */
export function runShortcut(id: ShortcutId): boolean {
  const list = handlers.get(id);
  const handler = list?.[list.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

/** Subscribe to registry changes (the cheat sheet shows what's available now). */
export function subscribeShortcutHandlers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam. */
export function resetShortcutHandlers(): void {
  handlers.clear();
  notify();
}

// --- single-key preference (WCAG 2.1.4) -------------------------------------

export const SINGLE_KEY_PREF_KEY = "mergepay:single-key-shortcuts";

export function readSingleKeyShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SINGLE_KEY_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSingleKeyShortcutsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SINGLE_KEY_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
}
