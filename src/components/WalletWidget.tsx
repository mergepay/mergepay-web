"use client";

/**
 * Live multi-asset wallet tracker + Stellar trustline validator (#199).
 *
 * Reads the connected Freighter account and shows real-time XLM and stable
 * asset (USDC) balances, then flags every group whose settlement asset the
 * wallet cannot hold yet (missing trustline) in bold warning-style
 * neobrutalist cards. A single "Setup Trustline" button drives the full
 * Freighter signature flow and optimistically updates the widget before the
 * transaction is confirmed on-chain.
 *
 * Private keys never touch Mergepay: the changeTrust transaction is built
 * here, signed in Freighter, and only the signed envelope is submitted to
 * the configured Horizon endpoint.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCcw,
  ShieldAlert,
  Wallet,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { shortKey } from "@/lib/format";
import { formatAssetAmountText } from "@/lib/currency";
import { STELLAR_NETWORK } from "@/lib/constants";
import {
  addTrustline,
  connectWallet,
  getWalletAssets,
  WalletError,
  walletMessage,
  type WalletErrorCode,
} from "@/lib/stellar";
import { useWalletStatus } from "@/hooks/useWalletStatus";
import { networkDisplayName } from "@/lib/walletStatus";
import type { TrustlineAsset } from "@/lib/trustline";

/** How often balances are re-read from Horizon while the widget is open. */
const BALANCE_POLL_INTERVAL_MS = 20_000;

/** A group worth flagging when the wallet cannot hold its settlement asset. */
export interface WalletGroupFlag {
  id: string;
  name: string;
  netAssetCode: string;
}

/** Minimum width for the balance grid before it stacks. */
const balanceRowClass =
  "flex items-center justify-between rounded-xl border-2 border-ink bg-paper px-3 py-2";

function BalanceRow({
  asset,
  optimistic,
}: {
  asset: TrustlineAsset;
  optimistic: boolean;
}) {
  const hasTrustline = asset.hasTrustline || optimistic;
  return (
    <div className={balanceRowClass}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-ink bg-cream font-display text-[10px] font-bold uppercase tracking-wide">
          {asset.code.slice(0, 2)}
        </span>
        <span className="font-display text-xs uppercase tracking-widest">
          {asset.name ?? asset.code}
        </span>
        {asset.code === "XLM" && (
          <Badge tone="aqua" className="shadow-none">
            native
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!hasTrustline && (
          <Badge tone="flamingo" className="shadow-none">
            no trustline
          </Badge>
        )}
        <span
          className="font-mono text-sm font-bold tabular-nums"
          title={`${asset.code} balance`}
        >
          {formatAssetAmountText(asset.balance, asset.code)}
        </span>
      </div>
    </div>
  );
}

/**
 * Bold warning-style neobrutalist card. Heavy ink borders on a bright
 * yellow/orange background so a missing trustline cannot be missed.
 */
function TrustlineWarning({
  asset,
  flaggedGroups,
  settingUp,
  errorCode,
  errorMessage,
  onSetup,
  onDismissError,
}: {
  asset: TrustlineAsset;
  flaggedGroups: WalletGroupFlag[];
  settingUp: boolean;
  errorCode: WalletErrorCode | null;
  errorMessage: string | null;
  onSetup: () => void;
  onDismissError: () => void;
}) {
  const icon =
    errorCode === "locked" ? (
      <WifiOff className="h-6 w-6" />
    ) : errorCode === "user_rejected" ? (
      <RefreshCcw className="h-6 w-6" />
    ) : (
      <ShieldAlert className="h-6 w-6" />
    );

  return (
    <div
      role="alert"
      className="rounded-2xl border-3 border-ink bg-butter p-4 shadow-brutal"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-tangerine text-ink shadow-brutal-sm">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold uppercase tracking-wide">
            {asset.code} trustline required
          </p>
          <p className="mt-1 text-xs leading-snug text-ink/80">
            Your wallet can&apos;t receive or settle{" "}
            <span className="font-bold">{asset.code}</span> until you approve
            a trustline with the issuer. Add it now — the signature request
            opens in Freighter.
          </p>
          {flaggedGroups.length > 0 && (
            <p className="mt-2 text-xs font-bold text-ink/90">
              Affected groups:{" "}
              {flaggedGroups.map((g) => g.name).join(", ")}
            </p>
          )}
          {errorMessage && (
            <div className="mt-2 flex items-start justify-between gap-2 rounded-xl border-2 border-ink bg-flamingo px-3 py-2 text-xs font-bold text-ink">
              <span>{errorMessage}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={onDismissError}
                className="shrink-0 font-display uppercase tracking-wide hover:underline"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          loading={settingUp}
          onClick={onSetup}
          className="bg-ink text-lime"
        >
          <Plug className="h-4 w-4" />
          {settingUp ? "Requesting signature…" : "Setup Trustline"}
        </Button>
      </div>
    </div>
  );
}

export function WalletWidget({
  groups,
  className,
}: {
  /** Groups whose settlement asset the wallet must be able to hold. */
  groups?: WalletGroupFlag[];
  className?: string;
}) {
  const { ...status } = useWalletStatus();
  const [assets, setAssets] = useState<TrustlineAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [settingUp, setSettingUp] = useState<string | null>(null);
  const [trustlineError, setTrustlineError] = useState<{
    code: WalletErrorCode | null;
    message: string | null;
  }>({ code: null, message: null });
  // Optimistically-set trustlines, keyed by asset code. Kept separate from
  // the fetched state so a confirmed changeTrust flips the card immediately.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const mounted = useRef(true);

  const address = status.address;

  const loadAssets = useCallback(async (publicKey: string) => {
    setAssetsLoading(true);
    try {
      const next = await getWalletAssets(publicKey);
      if (mounted.current) {
        setAssets(next);
        setAssetsError(false);
      }
    } catch {
      if (mounted.current) setAssetsError(true);
    } finally {
      if (mounted.current) setAssetsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Load balances whenever a wallet address is authorized, then poll so the
  // card stays live after settlements and inbound transfers.
  useEffect(() => {
    if (!address) {
      setAssets([]);
      return;
    }
    void loadAssets(address);
    const interval = setInterval(() => void loadAssets(address), BALANCE_POLL_INTERVAL_MS);
    const onFocus = () => void loadAssets(address);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [address, loadAssets]);

  async function handleConnect() {
    setConnecting(true);
    try {
      await connectWallet();
      toast.success("Wallet connected");
      // useWalletStatus's watcher picks up the new address.
    } catch (e) {
      toast.error(
        e instanceof WalletError ? e.message : "Could not reach your wallet."
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleSetupTrustline(asset: TrustlineAsset) {
    if (!address || !asset.issuer || settingUp) return;
    setSettingUp(asset.code);
    setTrustlineError({ code: null, message: null });
    // Optimistic: the changeTrust may take a few seconds to confirm on-chain,
    // but the card should reflect the intent immediately.
    setOptimistic((o) => ({ ...o, [asset.code]: true }));
    try {
      const { txHash } = await addTrustline(address, asset.code, asset.issuer);
      toast.success(
        `${asset.code} trustline confirmed on-chain`,
        { description: `Tx ${shortKey(txHash, 6)}` }
      );
      // Re-read so the canonical balance/trustline state matches reality.
      await loadAssets(address);
    } catch (e) {
      // A rejected signature is a normal, recoverable state — revert the
      // optimistic flag and surface the friendly reason without a scary
      // toast. Everything else maps to a stable, safe message too.
      const code = e instanceof WalletError ? e.code : null;
      setOptimistic((o) => ({ ...o, [asset.code]: false }));
      setTrustlineError({
        code,
        message: walletMessage(code ?? "unknown"),
      });
    } finally {
      if (mounted.current) setSettingUp(null);
    }
  }

  const native = assets.find((a) => a.code === "XLM");
  const stable = assets.find((a) => a.code !== "XLM");

  // Groups that need a trustline the wallet does not (yet) have.
  const flaggedGroups = (groups ?? []).filter((g) => {
    const asset = assets.find((a) => a.code === g.netAssetCode);
    if (!asset) return false;
    return !asset.hasTrustline && !optimistic[asset.code];
  });

  const missingAssets = assets.filter(
    (a) => a.code !== "XLM" && !a.hasTrustline && !optimistic[a.code]
  );

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b-3 border-ink bg-grape px-4 py-2.5 text-white">
        <span className="flex items-center gap-2 font-display text-xs uppercase tracking-widest">
          <Wallet className="h-4 w-4" />
          Wallet
        </span>
        <Badge tone={status.tone} className="shadow-none">
          {status.label}
        </Badge>
      </div>

      <div className="space-y-4 p-4">
        {status.kind === "checking" && (
          <div className="flex items-center gap-2 text-sm text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your
            wallet…
          </div>
        )}

        {status.kind === "unavailable" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink bg-flamingo-pale px-3 py-2 text-sm">
            <span>
              Freighter wasn&apos;t detected in this browser. Install it to
              settle on {networkDisplayName(STELLAR_NETWORK)}.
            </span>
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-xs uppercase tracking-widest text-grape underline"
            >
              Install Freighter
            </a>
          </div>
        )}

        {status.kind === "disconnected" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink bg-butter-pale px-3 py-2 text-sm">
            <span>
              Connect Freighter to see your {networkDisplayName(STELLAR_NETWORK)}{" "}
              balances.
            </span>
            <Button size="sm" onClick={handleConnect} loading={connecting}>
              <Plug className="h-4 w-4" /> Connect wallet
            </Button>
          </div>
        )}

        {status.kind === "network_mismatch" && (
          <div
            role="alert"
            className="rounded-xl border-2 border-ink bg-flamingo-pale px-3 py-2 text-sm"
          >
            {status.message}
          </div>
        )}

        {status.kind === "connected" && address && (
          <>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-ink/60">
                {shortKey(address, 6)}
              </span>
              <span className="sr-only">Connected Stellar address: {address}</span>
              <span className="text-[11px] text-ink/50">
                {networkDisplayName(STELLAR_NETWORK)}
              </span>
            </div>

            <div className="space-y-2">
              {assetsLoading && assets.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-ink/50">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
                  balances…
                </div>
              ) : assetsError && assets.length === 0 ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-flamingo-pale px-3 py-2 text-xs font-bold">
                  <span>Couldn&apos;t load balances right now.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void loadAssets(address)}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              ) : (
                <>
                  {native && <BalanceRow asset={native} optimistic={false} />}
                  {stable && (
                    <BalanceRow
                      asset={stable}
                      optimistic={Boolean(optimistic[stable.code])}
                    />
                  )}
                </>
              )}
            </div>

            {missingAssets.map((asset) => (
              <TrustlineWarning
                key={asset.code}
                asset={asset}
                flaggedGroups={flaggedGroups.filter(
                  (g) => g.netAssetCode === asset.code
                )}
                settingUp={settingUp === asset.code}
                errorCode={trustlineError.code}
                errorMessage={trustlineError.message}
                onSetup={() => void handleSetupTrustline(asset)}
                onDismissError={() =>
                  setTrustlineError({ code: null, message: null })
                }
              />
            ))}

            {missingAssets.length === 0 && flaggedGroups.length === 0 && (
              <div className="flex items-center gap-2 rounded-xl border-2 border-ink bg-lime-pale px-3 py-2 text-xs font-bold">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-ink" />
                Wallet ready for settlements on{" "}
                {networkDisplayName(STELLAR_NETWORK)}.
              </div>
            )}

            {missingAssets.length === 0 && flaggedGroups.length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border-2 border-ink bg-flamingo-pale px-3 py-2 text-xs font-bold"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Some groups need a trustline your wallet doesn&apos;t have
                  yet: {flaggedGroups.map((g) => g.name).join(", ")}.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
