import { ExternalLink } from "lucide-react";
import { explorerTxUrl, explorerAccountUrl } from "@/lib/constants";
import { shortHash, shortKey } from "@/lib/format";
import { CopyButton } from "./ui/copy-button";

/** Renders a Stellar transaction hash as a mono chip linking to stellar.expert. */
export function TxLink({ hash }: { hash: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={explorerTxUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-aqua-pale px-2 py-0.5 font-mono text-xs shadow-brutal-sm hover:bg-aqua transition-colors"
        title={hash}
      >
        {shortHash(hash)}
        <ExternalLink className="h-3 w-3" />
      </a>
      <CopyButton value={hash} />
    </span>
  );
}

export function PubkeyChip({ publicKey }: { publicKey: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={explorerAccountUrl(publicKey)}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border-2 border-ink bg-grape-pale px-2 py-0.5 font-mono text-xs shadow-brutal-sm hover:bg-grape-light transition-colors"
        title={publicKey}
      >
        {shortKey(publicKey, 6)}
      </a>
      <CopyButton value={publicKey} />
    </span>
  );
}
