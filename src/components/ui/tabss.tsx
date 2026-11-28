"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabDef {
  id: string;
  label: string;
  icon?: ReactNode;
}

/** DOM id of a tab button. Prefixed so ids like "all" can't clash with the page. */
export const getTabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
/** DOM id of the single panel shared by every tab in a tablist. */
export const getTabPanelId = (idBase: string) => `${idBase}-panel`;

/**
 * Accessible tablist (WAI-ARIA Tabs pattern, automatic activation).
 *
 * Keyboard: ArrowRight / ArrowLeft move to the next / previous tab (wrapping),
 * Home / End jump to the first / last tab. Selection follows focus, and only the
 * active tab is in the Tab order (roving tabIndex).
 *
 * Pair with <TabPanel idBase={sameIdBase} tabId={active}> around the content.
 */
export function Tabs({
  tabs,
  active,
  onChange,
  className,
  idBase = "tabs",
  label,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  /** Unique prefix for this tablist's ids; use a different one per tablist on a page. */
  idBase?: string;
  /** Accessible name for the tablist, e.g. "Filter transactions by type". */
  label?: string;
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // If `active` matches no tab, keep the first tab reachable with Tab.
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active)
  );

  const selectTab = (index: number) => {
    if (tabs.length === 0) return;
    const next = (index + tabs.length) % tabs.length;
    tabRefs.current[next]?.focus();
    if (tabs[next].id !== active) onChange(tabs[next].id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        selectTab(index + 1);
        break;
      case "ArrowLeft":
        selectTab(index - 1);
        break;
      case "Home":
        selectTab(0);
        break;
      case "End":
        selectTab(tabs.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn(
        "flex flex-wrap gap-2 border-3 border-ink rounded-2xl bg-paper p-2 shadow-brutal w-fit max-w-full",
        className
      )}
    >
      {tabs.map((tab, index) => {
        const selected = index === activeIndex;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            id={getTabId(idBase, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={getTabPanelId(idBase)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 font-display text-xs uppercase tracking-wide transition-all duration-100",
              // Neobrutalist focus: solid grape outline + hard offset shadow, lifted.
              "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-grape focus-visible:shadow-brutal-grape focus-visible:-translate-x-0.5 focus-visible:-translate-y-0.5",
              selected
                ? "border-ink bg-ink text-lime shadow-brutal-sm"
                : "border-transparent text-ink/70 hover:border-ink hover:bg-cream"
            )}
          >
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** The content region controlled by a <Tabs> list with the same idBase. */
export function TabPanel({
  idBase = "tabs",
  tabId,
  className,
  children,
}: {
  idBase?: string;
  /** The currently active tab's id. */
  tabId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={getTabPanelId(idBase)}
      aria-labelledby={getTabId(idBase, tabId)}
      tabIndex={0}
      className={cn(
        "rounded-2xl focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-grape",
        className
      )}
    >
      {children}
    </div>
  );
}
