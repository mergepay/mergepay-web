import { useEffect } from "react";
import { type ShortcutId, registerShortcutHandler } from "@/lib/keyboardShortcuts";

export function useShortcut(id: ShortcutId, handler: () => void): void {
  useEffect(() => {
    return registerShortcutHandler(id, handler);
  }, [id, handler]);
}
