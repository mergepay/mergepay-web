"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useShortcut } from "@/hooks/useShortcut";
import { dialogStack } from "@/lib/dialog";
import {
  SHORTCUTS,
  getShortcut,
  hasShortcutHandler,
  isEditableTarget,
  matchShortcut,
  readSingleKeyShortcutsEnabled,
  runShortcut,
  subscribeShortcutHandlers,
  writeSingleKeyShortcutsEnabled,
} from "@/lib/keyboardShortcuts";

/** Changes whenever a page registers or drops a shortcut handler. */
let registryVersion = 0;
function subscribeRegistry(onChange: () => void) {
  return subscribeShortcutHandlers(() => {
    registryVersion += 1;
    onChange();
  });
}
const getRegistryVersion = () => registryVersion;

/**
 * Mounted once in `Providers`, so shortcuts work on every route, the sign-in
 * page included. Listens on `window` in the bubble phase: a dialog, menu or
 * widget that handles a key itself (capture phase or `preventDefault`) wins.
 */
export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [singleKeyEnabled, setSingleKeyEnabled] = useState(true);

  useEffect(() => {
    setSingleKeyEnabled(readSingleKeyShortcutsEnabled());
  }, []);

  // "?" and the sidebar's "Keyboard shortcuts" button both go through here.
  useShortcut("show-help", () => setHelpOpen(true));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (isEditableTarget(document.activeElement)) return;
      // A modal owns the keyboard while it is open.
      if (dialogStack.size > 0) return;

      const id = matchShortcut(event);
      if (!id) return;
      if (getShortcut(id).singleKey && !singleKeyEnabled) return;
      if (runShortcut(id)) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [singleKeyEnabled]);

  const toggleSingleKey = useCallback((enabled: boolean) => {
    setSingleKeyEnabled(enabled);
    writeSingleKeyShortcutsEnabled(enabled);
  }, []);

  return (
    <KeyboardShortcutsDialog
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      singleKeyEnabled={singleKeyEnabled}
      onSingleKeyChange={toggleSingleKey}
    />
  );
}

export function KeyboardShortcutsDialog({
  open,
  onClose,
  singleKeyEnabled,
  onSingleKeyChange,
}: {
  open: boolean;
  onClose: () => void;
  singleKeyEnabled: boolean;
  onSingleKeyChange: (enabled: boolean) => void;
}) {
  // Re-render when the page's available shortcuts change.
  useSyncExternalStore(subscribeRegistry, getRegistryVersion, getRegistryVersion);
  const toggleId = useId();
  const captionId = useId();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Shortcuts never fire while you are typing in a field or while a dialog is open. Press Escape to close any dialog."
    >
      <table className="w-full border-collapse text-sm" aria-describedby={captionId}>
        <caption id={captionId} className="sr-only">
          Keyboard shortcuts, what they do, and whether they work on this page
        </caption>
        <thead>
          <tr className="border-b-2 border-ink text-left font-display text-[10px] uppercase tracking-widest text-ink/60">
            <th scope="col" className="py-2 pr-3">Keys</th>
            <th scope="col" className="py-2 pr-3">Action</th>
            <th scope="col" className="py-2">Where</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((shortcut) => {
            // Ctrl/⌘+K is owned by the app shell, not this registry.
            const available =
              shortcut.id === "command-palette" || shortcut.id === "show-help"
                ? true
                : hasShortcutHandler(shortcut.id);
            const disabled = shortcut.singleKey && !singleKeyEnabled;
            return (
              <tr
                key={shortcut.id}
                className="border-b border-ink/10 align-top"
                data-testid={`shortcut-row-${shortcut.id}`}
              >
                <td className="py-2 pr-3 whitespace-nowrap">
                  {shortcut.keys.map((key, index) => (
                    <span key={key}>
                      {index > 0 && (
                        <span aria-hidden="true" className="mx-1 text-ink/40">
                          +
                        </span>
                      )}
                      <kbd className="inline-block min-w-[1.75rem] rounded-md border-2 border-ink bg-cream px-1.5 py-0.5 text-center font-mono text-xs font-bold shadow-brutal-sm">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </td>
                <td className="py-2 pr-3 font-bold">{shortcut.description}</td>
                <td className="py-2 text-ink/70">
                  {shortcut.where}
                  {disabled ? (
                    <span className="block text-xs text-ink/50">Turned off</span>
                  ) : available ? (
                    <span className="block text-xs text-ink/50">Available on this page</span>
                  ) : (
                    <span className="block text-xs text-ink/50">Not available on this page</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex items-start gap-3 rounded-xl border-2 border-ink bg-cream p-3">
        <input
          id={toggleId}
          type="checkbox"
          checked={singleKeyEnabled}
          onChange={(event) => onSingleKeyChange(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-grape"
        />
        <label htmlFor={toggleId} className="text-sm">
          <span className="font-bold">Single-key shortcuts</span>
          <span className="block text-xs text-ink/60">
            ?, N, G and W. Turn these off if you use speech input or press keys by accident. Ctrl/⌘ + K
            and the Keyboard shortcuts button in the sidebar always work.
          </span>
        </label>
      </div>
    </Dialog>
  );
}
