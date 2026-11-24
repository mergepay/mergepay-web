"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildTransactionCsv,
  buildTransactionCsvFilename,
  downloadCsv,
  type HistoryExportItem,
} from "@/lib/transactionCsv";

export interface ExportFilteredCsvButtonProps {
  /** The rows currently visible after every History filter is applied. */
  items: ReadonlyArray<HistoryExportItem>;
  /** Active filters, used only to name the file. */
  assetCode?: string;
  startDate?: string;
  endDate?: string;
  /** Whether any filter is active, for the accessible label. */
  filtered?: boolean;
}

/**
 * Header-toolbar button that downloads the *filtered* transaction history as
 * a CSV file (#899). Everything runs in the browser: rows are serialised by
 * `buildTransactionCsv` and saved through a Blob object URL.
 */
export function ExportFilteredCsvButton({
  items,
  assetCode,
  startDate,
  endDate,
  filtered = false,
}: ExportFilteredCsvButtonProps) {
  const count = items.length;

  function handleExport() {
    if (count === 0) return;
    try {
      const csv = buildTransactionCsv(items);
      downloadCsv(
        csv,
        buildTransactionCsvFilename({ assetCode, startDate, endDate })
      );
      toast.success(
        `Exported ${count} transaction${count === 1 ? "" : "s"} to CSV`
      );
    } catch {
      toast.error("Could not generate the CSV export. Please try again.");
    }
  }

  const scope = filtered ? "filtered " : "";
  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={count === 0}
      aria-label={`Export ${count} ${scope}transaction${count === 1 ? "" : "s"} as CSV`}
      title={count === 0 ? "No transactions match the current filters" : undefined}
    >
      <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
      <span className="ml-1 rounded-md border-2 border-ink bg-butter px-1.5 text-[10px] font-display">
        {count}
      </span>
    </Button>
  );
}

export default ExportFilteredCsvButton;
