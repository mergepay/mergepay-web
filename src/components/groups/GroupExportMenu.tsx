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

import { useId } from "react";
import { ChevronDown, Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
  const hintId = useId();
  const enabled = hasExportableHistory(expenses, settlements);

  function handleExport(fileFormat: HistoryExportFormat) {
    try {
      const filename = exportGroupHistory(fileFormat, expenses, settlements, { groupId, groupName });
      if (filename) toast.success(`Downloaded ${filename}`);
      else toast.error("Downloads are not available in this browser.");
    } catch {
      toast.error("Could not generate the export. Please try again.");
    }
  }

  // Keyboard, focus and ARIA behaviour come from the shared menu primitive
  // (#813), so this menu navigates exactly like every other one in the app.
  return (
    <>
      <DropdownMenu
        label={menuLabel}
        disabled={!enabled}
        className={className}
        trigger={(triggerProps, { open }) => (
          // A disabled button swallows pointer events, so the tooltip lives on the wrapper.
          <span title={enabled ? undefined : EMPTY_EXPORT_HINT} className="inline-block">
            <Button
              {...triggerProps}
              variant="outline"
              size="sm"
              disabled={!enabled}
              aria-describedby={enabled ? undefined : hintId}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
            </Button>
          </span>
        )}
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem key={option.format} textValue={option.label} onSelect={() => handleExport(option.format)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-display text-xs uppercase tracking-wide">{option.label}</span>
                <span className="block text-xs text-ink/60">{option.hint}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenu>
      {!enabled && (
        <span id={hintId} className="sr-only">
          {EMPTY_EXPORT_HINT}
        </span>
      )}
    </>
  );
}
