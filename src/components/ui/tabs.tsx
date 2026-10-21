"use client";

import { cn } from "@/lib/utils";

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const focusTab = (index: number) => {
    const nextIndex = (index + tabs.length) % tabs.length;
    const tab = document.getElementById(tabs[nextIndex]?.id);
    tab?.focus();
  };

  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap gap-2 border-3 border-ink rounded-2xl bg-paper p-2 shadow-brutal w-fit max-w-full",
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            const index = tabs.findIndex(({ id }) => id === tab.id);
            if (event.key === "ArrowRight") {
              event.preventDefault();
              focusTab(index + 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              focusTab(index - 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              focusTab(0);
            } else if (event.key === "End") {
              event.preventDefault();
              focusTab(tabs.length - 1);
            }
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 font-display text-xs uppercase tracking-wide transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40",
            active === tab.id
              ? "border-ink bg-ink text-lime shadow-brutal-sm"
              : "border-transparent text-ink/70 hover:border-ink hover:bg-cream"
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
