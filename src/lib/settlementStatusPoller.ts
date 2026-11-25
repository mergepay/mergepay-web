export type SettlementLedgerStatus = "pending" | "confirmed" | "failed" | "timeout";

export interface SettlementPollResult {
  txHash: string;
  status: SettlementLedgerStatus;
  ledger?: number;
  attempts: number;
  errorMessage?: string;
}

export interface PollSettlementStatusOptions {
  txHash: string;
  checkStatus: (txHash: string) => Promise<{
    status: "pending" | "confirmed" | "failed";
    ledger?: number;
    errorMessage?: string;
  }>;
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, status: SettlementLedgerStatus) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function computePollBackoffDelay(
  attempt: number,
  initialDelayMs = 1000,
  maxDelayMs = 15000,
  backoffFactor = 2
): number {
  const safeAttempt = Math.max(0, attempt);
  const raw = initialDelayMs * Math.pow(backoffFactor, safeAttempt);
  return Math.min(maxDelayMs, Math.round(raw));
}

export async function pollSettlementTransactionStatus(
  options: PollSettlementStatusOptions
): Promise<SettlementPollResult> {
  const {
    txHash,
    checkStatus,
    maxAttempts = 8,
    initialDelayMs = 1000,
    maxDelayMs = 15000,
    backoffFactor = 2,
    signal,
    onAttempt,
    sleep = defaultSleep,
  } = options;

  const trimmedHash = txHash.trim();
  if (!trimmedHash) {
    return {
      txHash: "",
      status: "failed",
      attempts: 0,
      errorMessage: "Transaction hash is required",
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      return {
        txHash: trimmedHash,
        status: "timeout",
        attempts: attempt - 1,
        errorMessage: "Polling aborted",
      };
    }

    try {
      const response = await checkStatus(trimmedHash);
      onAttempt?.(attempt, response.status);

      if (response.status === "confirmed") {
        return {
          txHash: trimmedHash,
          status: "confirmed",
          ledger: response.ledger,
          attempts: attempt,
        };
      }

      if (response.status === "failed") {
        return {
          txHash: trimmedHash,
          status: "failed",
          attempts: attempt,
          errorMessage: response.errorMessage ?? "Transaction failed on Stellar ledger",
        };
      }
    } catch (err) {
      onAttempt?.(attempt, "pending");
      if (attempt === maxAttempts) {
        return {
          txHash: trimmedHash,
          status: "timeout",
          attempts: attempt,
          errorMessage: err instanceof Error ? err.message : "Network error while polling status",
        };
      }
    }

    if (attempt < maxAttempts) {
      const delay = computePollBackoffDelay(
        attempt - 1,
        initialDelayMs,
        maxDelayMs,
        backoffFactor
      );
      await sleep(delay);
    }
  }

  return {
    txHash: trimmedHash,
    status: "timeout",
    attempts: maxAttempts,
    errorMessage: "Timed out waiting for Stellar ledger finality",
  };
}
