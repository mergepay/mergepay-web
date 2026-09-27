import { explorerTxUrl } from "./explorer";
export {
  buildHistoryCsv,
  buildReceiptHtml,
  escapeCsv,
  escapeHtml,
  exportHistoryCsv,
  isValidTxHash,
  printReceipt,
} from "./export";

import type { Settlement } from "./types";

/** Structured audit metadata used by the history explorer panel. */
export function buildAuditDetails(settlement: Settlement) {
  return {
    settlementId: settlement.id,
    ledgerMemo: settlement.memo,
    stellarTxHash: settlement.stellarTxHash,
    explorerUrl: explorerTxUrl(settlement.stellarTxHash),
    network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "public",
  };
}
