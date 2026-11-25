"use client";

/**
 * Group export modal (#337).
 *
 * One dialog that offers a group's expense and settlement history as either
 * CSV (spreadsheets, bookkeeping, tax tools) or JSON (full per-share detail),
 * with an explicit format choice instead of separate buttons per format.
 *
 * Serialization lives in `src/lib/utils/export.ts` — pure functions that own
 * the date formatting, the RFC 4180 quoting and the formula-injection guard —
 * so this component only selects a format, builds the file and asks the
 * shared download helper to save it. Nothing leaves the browser.
 */

import { useId, useState } from "react";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldHint } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  EXPORT_MIME_TYPES,
  buildHistoryExportFilename,
  downloadTextFile,
  hasExportableHistory,
  historyToCsv,
  historyToJson,
  type HistoryExportFormat,
} from "@/lib/utils/export";
import type { Expense, Settlement } from "@/lib/types";

export const EMPTY_EXPORT_MESSAGE =
  "No expenses or settlements to export yet.";

const FORMAT_OPTIONS: {
  format: HistoryExportFormat;
  title: string;
  hint: string;
  icon: typeof FileJson;
}[] = [
  {
    format: "csv",
    title: "CSV",
    hint: "Opens in spreadsheets and accounting tools.",
    icon: FileSpreadsheet,
  },
  {
    format: "json",
    title: "JSON",
    hint: "Full detail, including every participant share.",
    icon: FileJson,
  },
];

export interface ExportGroupModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName?: string | null;
  expenses: Expense[];
  settlements: Settlement[];
  /** Called after a file is saved — lets the owner refresh a toast or badge. */
  onExported?: (filename: string, format: HistoryExportFormat) => void;
}

export function ExportGroupModal({
  open,
  onClose,
  groupId,
  groupName,
  expenses,
  settlements,
  onExported,
}: ExportGroupModalProps) {
  const [format, setFormat] = useState<HistoryExportFormat>("csv");
  const formatName = useId();
  const emptyId = useId();
  const hasData = hasExportableHistory(expenses, settlements);

  function handleDownload() {
    const content =
      format === "csv"
        ? historyToCsv(expenses, settlements)
        : historyToJson(expenses, settlements, { groupId, groupName });
    const filename = buildHistoryExportFilename(groupName || groupId, format);

    if (!downloadTextFile(content, filename, EXPORT_MIME_TYPES[format])) {
      toast.error("Downloads are not available in this browser.");
      return;
    }

    toast.success(`Downloaded ${filename}`);
    onExported?.(filename, format);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export group history"
      description="Download this group's expenses and settlements. The file is built in your browser — nothing is sent to a server."
    >
      <div className="space-y-4">
        <p className="font-display text-xs uppercase tracking-widest text-ink/60">
          {expenses.length} {expenses.length === 1 ? "expense" : "expenses"} ·{" "}
          {settlements.length}{" "}
          {settlements.length === 1 ? "settlement" : "settlements"}
        </p>

        <fieldset>
          <legend className="mb-1.5 block font-display text-xs uppercase tracking-widest text-ink">
            File format
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMAT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = format === option.format;
              return (
                <label
                  key={option.format}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border-3 border-ink p-3 transition-all duration-100",
                    selected
                      ? "bg-lime-pale shadow-brutal-sm"
                      : "bg-cream hover:bg-paper"
                  )}
                >
                  <input
                    type="radio"
                    name={formatName}
                    value={option.format}
                    checked={selected}
                    onChange={() => setFormat(option.format)}
                    aria-describedby={`${formatName}-${option.format}-hint`}
                    className="mt-1 h-4 w-4 accent-grape focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wide">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {option.title}
                    </span>
                    <span
                      id={`${formatName}-${option.format}-hint`}
                      className="block text-xs text-ink/60"
                    >
                      {option.hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {hasData ? (
          <FieldHint>
            Filenames include the group and a timestamp, so repeated exports
            never overwrite each other.
          </FieldHint>
        ) : (
          <p id={emptyId} className="text-xs font-bold text-ink/60">
            {EMPTY_EXPORT_MESSAGE}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!hasData}
            aria-describedby={hasData ? undefined : emptyId}
            title={hasData ? undefined : EMPTY_EXPORT_MESSAGE}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download {format.toUpperCase()}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
