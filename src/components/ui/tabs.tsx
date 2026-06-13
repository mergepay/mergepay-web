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
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 font-display text-xs uppercase tracking-wide transition-all duration-100",
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
