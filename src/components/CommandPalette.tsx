"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Search, Plus, LayoutDashboard, Users, Banknote, History, Settings, Wallet, ArrowRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { toast } from "sonner";
import type { NAV } from "@/components/app-shell";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface NavTarget {
  href: string;
  label: string;
  icon: React.ElementType;
  category: string;
}

const NAV_ITEMS: NavTarget[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, category: "Navigate" },
  { href: "/groups", label: "Groups", icon: Users, category: "Navigate" },
  { href: "/anchors", label: "Anchors", icon: Banknote, category: "Navigate" },
  { href: "/history", label: "History", icon: History, category: "Navigate" },
  { href: "/settings", label: "Settings", icon: Settings, category: "Navigate" },
];

const NEW_EXPENSE_ITEM: NavTarget = {
  href: "/new-expense",
  label: "New Expense",
  icon: Plus,
  category: "Action",
};

function isInputModifierKey(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) || e.key === "Escape";
}

function isTypingInInput(e: KeyboardEvent): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return (tag === "input" || tag === "textarea" || (active instanceof HTMLElement && active.isContentEditable)) && !isInputModifierKey(e);
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const filteredItems = useMemo(() => {
    if (!query.trim()) return NAV_ITEMS;
    const lower = query.toLowerCase();
    return NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower) ||
        item.href.toLowerCase().includes(lower)
    );
  }, [query]);

  const allItems = useMemo(() => {
    if (!query.trim()) return [...NAV_ITEMS];
    return filteredItems;
  }, [query, filteredItems]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, NavTarget[]>();
    for (const item of allItems) {
      const cat = item.category;
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return groups;
  }, [allItems]);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingInInput(e)) return;

      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        toast.info("New expense coming soon");
        return;
      }

      if (e.key === "Tab" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev <= 0 ? allItems.length - 1 : prev - 1));
        } else if (e.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev >= allItems.length - 1 ? 0 : prev + 1));
        } else if (e.key === "Tab") {
          setSelectedIndex((prev) => (e.shiftKey ? (prev <= 0 ? allItems.length - 1 : prev - 1) : (prev >= allItems.length - 1 ? 0 : prev + 1)));
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const flatItems = allItems;
        if (flatItems[selectedIndex]) {
          const item = flatItems[selectedIndex];
          if (item.href === "/new-expense") {
            toast.info("New expense coming soon");
            onClose();
            return;
          }
          router.push(item.href);
          onClose();
        }
        return;
      }
    },
    [onClose, allItems, selectedIndex, router]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [handleGlobalKeyDown]);

  const handleItemClick = useCallback(
    (item: NavTarget) => {
      if (item.href === "/new-expense") {
        toast.info("New expense coming soon");
        onClose();
        return;
      }
      router.push(item.href);
      onClose();
    },
    [router, onClose]
  );

  const flatItems = useMemo(() => {
    const items: NavTarget[] = [];
    for (const group of groupedItems.values()) {
      items.push(...group);
    }
    return items;
  }, [groupedItems]);

  return (
    <Dialog open={open} onClose={onClose} title="Command Palette" description="Search and navigate quickly">
      <div className="border-3 border-ink bg-cream shadow-brutal rounded-xl p-4">
        <div className="flex items-center gap-3 border-b-2 border-ink pb-3 mb-3">
          <Search className="h-5 w-5 text-ink/60" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search..."
            className="flex-1 bg-transparent font-display text-sm uppercase tracking-wide text-ink outline-none placeholder:text-ink/40"
            aria-label="Search navigation"
          />
          <Badge tone="ink" className="text-[9px]">
            <kbd className="mr-0.5">ESC</kbd>
          </Badge>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto" role="listbox" aria-label="Navigation results">
          {Array.from(groupedItems.entries()).map(([category, items]) => (
            <div key={category}>
              <p className="font-display text-[10px] uppercase tracking-widest text-ink/50 mb-2 px-1">{category}</p>
              {items.map((item, idx) => {
                const globalIndex = flatItems.indexOf(item);
                const isSelected = globalIndex === selectedIndex;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <button
                    key={item.href}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 font-display text-sm uppercase tracking-wide transition-all duration-100 ${
                      isSelected
                        ? "border-ink bg-grape text-white shadow-brutal-sm"
                        : "border-transparent text-ink/70 hover:border-ink hover:bg-cream"
                    } ${isActive ? "opacity-70" : ""}`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isActive && <span className="text-[10px] text-ink/50">Active</span>}
                    <ArrowRight className="h-4 w-4 opacity-50" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t-2 border-ink flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge tone="butter" className="text-[9px]">
              <kbd>Tab</kbd> Navigate
            </Badge>
            <Badge tone="butter" className="text-[9px]">
              <kbd>Enter</kbd> Open
            </Badge>
          </div>
          {user && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleItemClick(NEW_EXPENSE_ITEM)}
              className="text-[10px]"
            >
              <Plus className="mr-1 h-3 w-3" /> New Expense
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
