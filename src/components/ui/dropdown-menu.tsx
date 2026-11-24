"use client";

/**
 * Accessible neobrutalist dropdown menu (#813).
 *
 * Implements the WAI-ARIA "Menu Button" pattern so every popup menu in the app
 * behaves the same for keyboard and screen-reader users:
 *
 * - the trigger carries `aria-haspopup="menu"`, `aria-expanded` and, while
 *   open, `aria-controls` pointing at the menu
 * - Enter, Space or ArrowDown on the trigger opens the menu on its first item;
 *   ArrowUp opens it on the last
 * - inside the menu, arrows move and wrap, Home/End jump, and typing a letter
 *   jumps to the matching item (rules in `src/lib/menuNavigation.ts`)
 * - Escape closes the menu and returns focus to the trigger without also
 *   closing a dialog the menu sits in; Tab closes it and lets focus move on
 * - choosing an item, clicking outside, or focus leaving the menu closes it
 *
 * Items are `role="menuitem"` buttons with roving `tabIndex=-1`, so Tab never
 * stops on them; a disabled item is `aria-disabled` and skipped by navigation
 * but still announced.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";
import {
  firstEnabledIndex,
  isTypeaheadKey,
  lastEnabledIndex,
  menuNavigationTarget,
  typeaheadIndex,
  type MenuItemState,
} from "@/lib/menuNavigation";

/** Props the trigger element must spread to be wired into the menu. */
export interface DropdownTriggerProps {
  ref: Ref<HTMLButtonElement>;
  id: string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface DropdownMenuProps {
  /** Accessible name of the menu itself (not the trigger). */
  label: string;
  /** Renders the trigger; spread `props` onto a `<button>` (or `Button`). */
  trigger: (props: DropdownTriggerProps, state: { open: boolean }) => ReactNode;
  children: ReactNode;
  /** Which trigger edge the menu lines up with. Default `end`. */
  align?: "start" | "end";
  /** Forces the menu closed and keeps it closed, e.g. when there is nothing to offer. */
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  /** Observes open/close, e.g. for analytics or to sync a parent. */
  onOpenChange?: (open: boolean) => void;
}

interface MenuContextValue {
  close: (restoreFocus?: boolean) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

const TYPEAHEAD_RESET_MS = 500;

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function itemStates(items: HTMLElement[]): MenuItemState[] {
  return items.map((el) => ({
    label: el.dataset.label ?? el.textContent ?? "",
    disabled: el.getAttribute("aria-disabled") === "true",
  }));
}

export function DropdownMenu({
  label,
  trigger,
  children,
  align = "end",
  disabled = false,
  className,
  menuClassName,
  onOpenChange,
}: DropdownMenuProps) {
  const [open, setOpenState] = useState(false);
  // Which item to focus once the menu has rendered: first, last, or none.
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ query: "", timer: 0 as ReturnType<typeof setTimeout> | 0 });
  const triggerId = useId();
  const menuId = useId();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const setOpen = useCallback((next: boolean) => {
    setOpenState((prev) => {
      if (prev !== next) onOpenChangeRef.current?.(next);
      return next;
    });
  }, []);

  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [setOpen]
  );

  const openMenu = useCallback(
    (focus: "first" | "last") => {
      if (disabled) return;
      setInitialFocus(focus);
      setOpen(true);
    },
    [disabled, setOpen]
  );

  // Nothing to offer any more (e.g. data refetched away) — close.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled, setOpen]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    const states = itemStates(items);
    const index = initialFocus === "last" ? lastEnabledIndex(states) : firstEnabledIndex(states);
    (items[index] ?? menuRef.current)?.focus();
  }, [open, initialFocus]);

  // Outside pointer presses close without stealing focus back.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent | globalThis.MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown as EventListener, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown as EventListener);
    };
  }, [open, close]);

  useEffect(
    () => () => {
      if (typeahead.current.timer) clearTimeout(typeahead.current.timer);
    },
    []
  );

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  function onTriggerClick() {
    if (open) close();
    else openMenu("first");
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = menuItems(menuRef.current);
    const states = itemStates(items);
    const current = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      event.preventDefault();
      // Keep the key from reaching a dialog or shortcut handler behind us.
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      // Let the browser move focus on from the trigger's position.
      close(false);
      triggerRef.current?.focus();
      return;
    }
    const target = menuNavigationTarget(event.key, states, current);
    if (target !== null) {
      event.preventDefault();
      items[target]?.focus();
      return;
    }
    if (isTypeaheadKey(event)) {
      const state = typeahead.current;
      if (state.timer) clearTimeout(state.timer);
      state.query += event.key;
      state.timer = setTimeout(() => {
        state.query = "";
        state.timer = 0;
      }, TYPEAHEAD_RESET_MS);
      const match = typeaheadIndex(states, state.query, current);
      if (match !== -1) {
        event.preventDefault();
        items[match]?.focus();
      }
    }
  }

  function onMenuBlur(event: React.FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    // Focus moved somewhere outside the menu and its trigger (e.g. a screen
    // reader jump): the menu no longer has the user's attention.
    if (next && !rootRef.current?.contains(next)) close(false);
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      {trigger(
        {
          ref: triggerRef,
          id: triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": open,
          "aria-controls": open ? menuId : undefined,
          onClick: onTriggerClick,
          onKeyDown: onTriggerKeyDown,
        },
        { open }
      )}
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            aria-orientation="vertical"
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            onBlur={onMenuBlur}
            className={cn(
              "absolute z-30 mt-2 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-3 border-ink bg-cream p-1.5 shadow-brutal outline-none",
              align === "end" ? "right-0" : "left-0",
              menuClassName
            )}
          >
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

export interface DropdownMenuItemProps {
  children: ReactNode;
  /** Runs when the item is chosen (click, Enter or Space). */
  onSelect: () => void;
  disabled?: boolean;
  /** Label for type-ahead when `children` is not plain text. */
  textValue?: string;
  /** Keep the menu open after selection (e.g. a toggle). Default false. */
  keepOpen?: boolean;
  className?: string;
}

export function DropdownMenuItem({
  children,
  onSelect,
  disabled = false,
  textValue,
  keepOpen = false,
  className,
}: DropdownMenuItemProps) {
  const menu = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      data-label={textValue}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        // Return focus to the trigger first, so a dialog opened by `onSelect`
        // remembers the trigger as the place to hand focus back to.
        if (!keepOpen) menu?.close(true);
        onSelect();
      }}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border-2 border-transparent px-3 py-2 text-left transition-colors focus:outline-none",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-ink hover:bg-lime-pale focus:border-ink focus:bg-lime-pale",
        className
      )}
    >
      {children}
    </button>
  );
}
