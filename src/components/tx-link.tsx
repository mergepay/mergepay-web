import { ExternalLink } from "lucide-react";
import { explorerTxUrl, explorerAccountUrl } from "@/lib/explorer";
import { shortHash, shortKey } from "@/lib/format";
import CopyButton from "./ui/CopyButton";

/**
 * Renders a Stellar transaction hash as a mono chip linking to the
 * explorer for the configured network, plus a copy action.
 *
 * The hash is untrusted API data: when it is missing or does not look
 * like a transaction hash we render a plain chip rather than a link that
 * would dead-end on the explorer. An absent hash renders nothing, so
 * callers can pass `settlement.stellarTxHash` straight through.
 */
export function TxLink({ hash }: { hash: string | null | undefined }) {
  if (!hash) return null;

  const href = explorerTxUrl(hash);

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-aqua-pale px-2 py-0.5 font-mono text-xs shadow-brutal-sm hover:bg-aqua transition-colors"
          title={hash}
        >
          {shortHash(hash)}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">
            View transaction {hash} on the Stellar explorer (opens in a new tab)
          </span>
        </a>
      ) : (
        <span
          className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-paper px-2 py-0.5 font-mono text-xs shadow-brutal-sm"
          title={hash}
        >
          {shortHash(hash)}
          <span className="sr-only">
            Transaction reference {hash} — no explorer link available
          </span>
        </span>
      )}
      <CopyButton text={hash} what="transaction hash" />
    </span>
  );
}

export function PubkeyChip({
  publicKey,
}: {
  publicKey: string | null | undefined;
}) {
  if (!publicKey) return null;

  const href = explorerAccountUrl(publicKey);

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border-2 border-ink bg-grape-pale px-2 py-0.5 font-mono text-xs shadow-brutal-sm hover:bg-grape-light transition-colors"
          title={publicKey}
        >
          {shortKey(publicKey, 6)}
          <span className="sr-only">
            View account {publicKey} on the Stellar explorer (opens in a new tab)
          </span>
        </a>
      ) : (
        <span
          className="rounded-lg border-2 border-ink bg-paper px-2 py-0.5 font-mono text-xs shadow-brutal-sm"
          title={publicKey}
        >
          {shortKey(publicKey, 6)}
        </span>
      )}
      <CopyButton text={publicKey} what="Stellar address" />
    </span>
  );
}
