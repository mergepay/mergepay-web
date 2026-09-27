"use client";

/**
 * Export dropdown for the group dashboard header (#355).
 *
 * Offers the group's expense and settlement history as CSV (spreadsheets,
 * bookkeeping) or JSON (full per-share detail). Files are built in the
 * browser by `src/lib/utils/export.ts` and named with a timestamp so repeated
 * exports never overwrite each other. With no history yet the trigger is
 * disabled and explains why.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportGroupHistory, hasExportableHistory, type HistoryExportFormat } from "@/lib/utils/export";
import type { Expense, Settlement } from "@/lib/types";

export const EMPTY_EXPORT_HINT = "No expenses or settlements to export yet.";

const OPTIONS: { format: HistoryExportFormat; label: string; hint: string; icon: typeof FileJson }[] = [
  { format: "csv", label: "Export as CSV", hint: "Spreadsheets & bookkeeping", icon: FileSpreadsheet },
  { format: "json", label: "Export as JSON", hint: "Full detail, per-share", icon: FileJson },
];

export function GroupExportMenu({
  groupId,
  groupName,
  expenses,
  settlements,
  className,
  menuLabel = "Export group history",
}: {
  groupId: string;
  groupName?: string | null;
  expenses: Expense[];
  settlements: Settlement[];
  className?: string;
  /**
   * Accessible name for the popup menu. Defaults to the group-dashboard
   * wording; the account-wide history view passes its own (#362).
   */
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const hintId = useId();
  const enabled = hasExportableHistory(expenses, settlements);

  // Close on outside click; focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Data can disappear underneath an open menu (e.g. a refetch) — close it.
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function handleExport(fileFormat: HistoryExportFormat) {
    close();
    try {
      const filename = exportGroupHistory(fileFormat, expenses, settlements, { groupId, groupName });
      if (filename) toast.success(`Downloaded ${filename}`);
      else toast.error("Downloads are not available in this browser.");
    } catch {
      toast.error("Could not generate the export. Please try again.");
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      {/* A disabled button swallows pointer events, so the tooltip lives on the wrapper. */}
      <span title={enabled ? undefined : EMPTY_EXPORT_HINT} className="inline-block">
        <Button
          ref={triggerRef}
          variant="outline"
          size="sm"
          disabled={!enabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-describedby={enabled ? undefined : hintId}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Export
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </Button>
      </span>
      {!enabled && (
        <span id={hintId} className="sr-only">
          {EMPTY_EXPORT_HINT}
        </span>
      )}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-2 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-3 border-ink bg-cream p-1.5 shadow-brutal"
        >
          {OPTIONS.map((option, i) => {
            const Icon = option.icon;
            return (
              <button
                key={option.format}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => handleExport(option.format)}
                className="flex w-full items-start gap-3 rounded-lg border-2 border-transparent px-3 py-2 text-left transition-colors hover:border-ink hover:bg-lime-pale focus:border-ink focus:bg-lime-pale focus:outline-none"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block font-display text-xs uppercase tracking-wide">{option.label}</span>
                  <span className="block text-xs text-ink/60">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
