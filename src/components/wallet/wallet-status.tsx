"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  ShieldX,
  Wallet,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/ui/CopyButton";
import { cn } from "@/lib/utils";
import { shortKey } from "@/lib/format";
import { STELLAR_NETWORK } from "@/lib/constants";
import { FREIGHTER_INSTALL_URL, WalletError, connectWallet } from "@/lib/stellar";
import { networkDisplayName, type WalletStatus } from "@/lib/walletStatus";

function StatusIcon({ kind }: { kind: WalletStatus["kind"] }) {
  const className = "h-4 w-4";
  switch (kind) {
    case "checking":
      return <Loader2 className={cn(className, "animate-spin")} />;
    case "unavailable":
      return <ShieldX className={className} />;
    case "disconnected":
      return <WifiOff className={className} />;
    case "network_mismatch":
      return <AlertTriangle className={className} />;
    default:
      return <Wallet className={className} />;
  }
}

/**
 * The recovery control for a wallet state. Rendered only when the state has
 * something for the user to do.
 */
function RecoveryAction({
  status,
  onConnected,
  size = "sm",
}: {
  status: WalletStatus;
  onConnected?: () => void;
  size?: "sm" | "md";
}) {
  const [connecting, setConnecting] = useState(false);

  if (!status.actionKind || !status.actionLabel) return null;

  if (status.actionKind === "install") {
    return (
      <a
        href={FREIGHTER_INSTALL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-lg border-2 border-ink bg-cream px-2 py-1 font-display text-[10px] uppercase tracking-widest shadow-brutal-sm hover:bg-butter"
      >
        {status.actionLabel}
      </a>
    );
  }

  if (status.actionKind === "switch_network") {
    return (
      <span className="text-xs text-ink/70">
        Open Freighter and select {networkDisplayName(STELLAR_NETWORK)}.
      </span>
    );
  }

  return (
    <Button
      size={size}
      variant="outline"
      loading={connecting}
      onClick={async () => {
        setConnecting(true);
        try {
          // Prompts Freighter for access. Only the public address is returned
          // and it is never written to storage.
          await connectWallet();
          onConnected?.();
        } catch (e) {
          toast.error(
            e instanceof WalletError ? e.message : "Could not reach your wallet."
          );
        } finally {
          setConnecting(false);
        }
      }}
    >
      {status.actionLabel}
    </Button>
  );
}

/**
 * Compact wallet indicator for the app shell.
 *
 * Shows the connected address in truncated form with the full value exposed to
 * assistive tech, and surfaces a recovery action for every non-connected state.
 */
export function WalletStatusPanel({
  status,
  onRefresh,
  className,
}: {
  status: WalletStatus;
  onRefresh?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 border-ink bg-paper px-3 py-2.5",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
          <StatusIcon kind={status.kind} />
        </span>
        <Badge tone={status.tone} className="shadow-none">
          {status.label}
        </Badge>
      </div>

      {status.address ? (
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink/70"
            aria-hidden="true"
          >
            {shortKey(status.address, 5)}
          </span>
          {/* The full address is what assistive tech reads out; the truncated
              form above is decorative. */}
          <span className="sr-only">
            Connected Stellar address: {status.address}
          </span>
          <CopyButton text={status.address} className="shrink-0" />
        </div>
      ) : null}

      <p className="mt-2 text-[11px] leading-snug text-ink/60">{status.message}</p>

      {(status.actionKind || onRefresh) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RecoveryAction status={status} onConnected={onRefresh} />
        </div>
      )}
    </div>
  );
}

/**
 * Explains why a signing control is unavailable and offers the recovery step.
 * Renders nothing once the wallet is ready, and is never used to gate
 * read-only content.
 */
export function WalletPrerequisiteNotice({
  status,
  onRefresh,
}: {
  status: WalletStatus;
  onRefresh?: () => void;
}) {
  if (status.canSign) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink bg-butter-pale px-4 py-3 text-sm"
      role="status"
    >
      <span className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
          <StatusIcon kind={status.kind} />
        </span>
        <span>{status.message}</span>
      </span>
      <RecoveryAction status={status} onConnected={onRefresh} />
    </div>
  );
}

/**
 * Guard for controls that require a signature: renders `children` only when
 * the wallet is ready, and the prerequisite notice otherwise.
 */
export function WalletActionGate({
  status,
  onRefresh,
  children,
}: {
  status: WalletStatus;
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  if (status.canSign) return <>{children}</>;
  return <WalletPrerequisiteNotice status={status} onRefresh={onRefresh} />;
}
