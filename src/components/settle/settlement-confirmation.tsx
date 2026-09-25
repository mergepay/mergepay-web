import { AlertTriangle, Info, Network, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { EXPECTED_NETWORK_LABEL } from "@/lib/constants";
import { CONFIGURED_NETWORK } from "@/lib/explorer";
import type { StellarNetwork } from "@/lib/types";

/**
 * Pre-sign confirmation panel shown before the user opens Freighter.
 *
 * Makes it explicit which Stellar network the transaction targets, which
 * asset is being sent, and what the recipient context is. This prevents
 * signing against an unintended environment and reduces settlement mistakes.
 */
export function SettlementConfirmation({
  toDisplayName,
  amount,
  assetCode,
  assetIssuer,
  intentNetworkPassphrase,
}: {
  toDisplayName: string;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  /** The network passphrase returned by the API in the settlement intent. */
  intentNetworkPassphrase?: string | null;
}) {
  const networkMismatch =
    intentNetworkPassphrase != null &&
    intentNetworkPassphrase !== "" &&
    intentNetworkPassphrase !== expectePassphraseForNetwork(CONFIGURED_NETWORK);

  return (
    <div className="space-y-3">
      {/* Network context */}
      <div
        className="flex items-center gap-2 rounded-xl border-2 border-ink bg-aqua-pale px-4 py-2.5"
        role="status"
        aria-label={`Settlement will be processed on ${EXPECTED_NETWORK_LABEL}`}
      >
        <Network className="h-4 w-4 shrink-0 text-ink" />
        <div className="flex-1">
          <p className="font-display text-[10px] uppercase tracking-widest text-ink/50">
            Stellar network
          </p>
          <p className="text-sm font-bold">{EXPECTED_NETWORK_LABEL}</p>
        </div>
        <Badge tone="aqua">{CONFIGURED_NETWORK}</Badge>
      </div>

      {/* Asset and amount summary */}
      <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-paper px-4 py-2.5">
        <div>
          <p className="font-display text-[10px] uppercase tracking-widest text-ink/50">
            Settlement asset
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <AssetBadge code={assetCode} />
            {assetIssuer && (
              <span className="text-xs text-ink/50">
                Issuer: {assetIssuer.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>
        <Money value={amount} assetCode={assetCode} />
      </div>

      {/* Recipient */}
      <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-paper px-4 py-2.5">
        <Shield className="h-4 w-4 shrink-0 text-ink/50" />
        <div>
          <p className="font-display text-[10px] uppercase tracking-widest text-ink/50">
            Paying
          </p>
          <p className="text-sm font-bold">{toDisplayName}</p>
        </div>
      </div>

      {/* Network mismatch warning — the API returned a transaction envelope
          built for a different network than the one this deployment is
          configured for. Signing it would fail on submission, so we block. */}
      {networkMismatch && (
        <div
          className="flex items-start gap-3 rounded-xl border-2 border-ink bg-flamingo-pale px-4 py-3 text-sm"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flamingo-dark" />
          <div>
            <p className="font-display text-[10px] uppercase tracking-widest text-ink/50">
              Network mismatch
            </p>
            <p className="mt-1">
              The transaction was built for a different Stellar network than
              this deployment expects. Do not sign this transaction — contact
              support or try again later.
            </p>
          </div>
        </div>
      )}

      {/* Security notice */}
      <p className="flex items-center gap-1.5 text-xs text-ink/50">
        <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
        Mergepay builds the payment. Your keys never leave your wallet.
      </p>
    </div>
  );
}

/**
 * Return the expected passphrase for a given network, used to detect
 * a mismatch between the intent and the configured network.
 */
function expectePassphraseForNetwork(network: StellarNetwork): string {
  const passphrases: Record<StellarNetwork, string> = {
    public: "Public Global Stellar Network ; September 2015",
    testnet: "Test SDF Network ; September 2015",
  };
  return passphrases[network];
}
