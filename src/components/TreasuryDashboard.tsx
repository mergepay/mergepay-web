"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import {
  Landmark,
  ShieldCheck,
  CheckCircle2,
  FileSignature,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AssetBadge } from "@/components/asset-badge";
import { Money } from "@/components/amount";
import { formatStellarAssetAmount } from "@/lib/currency";
import { PubkeyChip, TxLink } from "@/components/tx-link";
import { Timestamp } from "@/components/timestamp";
import {
  useGroups,
  useTreasuryInfo,
  useTreasuryHistory,
} from "@/lib/queries";
import {
  signAndConfirmTreasuryTx,
  WalletError,
  WalletNotInstalledError,
} from "@/lib/stellar";
import { NETWORK_PASSPHRASE } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import type { TreasuryTransaction } from "@/lib/types";

export interface TreasuryDashboardProps {
  /** Optional group ID. If omitted, allows picking from user's treasury-enabled groups. */
  groupId?: string;
  className?: string;
}

export function TreasuryDashboard({ groupId: propGroupId, className }: TreasuryDashboardProps) {
  const { user } = useAuth();
  const { data: groupsData, isLoading: groupsLoading } = useGroups();
  const treasuryGroups = (groupsData?.groups ?? []).filter((g) => g.treasuryEnabled);

  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    return propGroupId ?? treasuryGroups[0]?.id ?? "";
  });

  const activeGroupId = propGroupId || selectedGroupId || treasuryGroups[0]?.id || "";

  const info = useTreasuryInfo(activeGroupId, Boolean(activeGroupId));
  const history = useTreasuryHistory(activeGroupId, Boolean(activeGroupId));

  const [signingTxId, setSigningTxId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const requiredSigners = info.data?.thresholds?.med ?? 2;
  const totalSigners = info.data?.signers?.length || 3;

  // Filter transactions
  const transactions: TreasuryTransaction[] = history.data?.transactions ?? [];
  const pendingTransactions = transactions.filter(
    (tx) => tx.status === "pending" || tx.direction === "withdrawal" && tx.status !== "confirmed" && tx.status !== "failed"
  );
  const displayedTransactions = filter === "pending" ? pendingTransactions : transactions;

  async function handleApprove(tx: TreasuryTransaction) {
    try {
      setSigningTxId(tx.id);
      // Initiate signing flow via Freighter
      await signAndConfirmTreasuryTx(tx.id, (tx as unknown as { xdr?: string }).xdr ?? "", NETWORK_PASSPHRASE);
      toast.success(`Treasury payout of ${formatStellarAssetAmount(tx.amount, tx).text} signed successfully!`);
      await history.refetch();
      await info.refetch();
    } catch (err: unknown) {
      if (err instanceof WalletNotInstalledError) {
        toast.error("Freighter wallet extension not detected. Please install Freighter.");
      } else if (err instanceof WalletError) {
        toast.error(err.message);
      } else if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Failed to approve transaction.");
      }
    } finally {
      setSigningTxId(null);
    }
  }

  return (
    <div className={`space-y-6 ${className ?? ""}`} data-testid="treasury-dashboard">
      {/* Header & Group Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border-3 border-ink bg-butter shadow-brutal-sm">
              <Landmark className="h-5 w-5 text-ink" />
            </span>
            <h2 className="font-display text-2xl uppercase tracking-tight text-ink">
              Treasury Dashboard
            </h2>
          </div>
          <p className="text-sm text-ink/70 mt-1">
            Multi-signature approval queue & shared treasury management
          </p>
        </div>

        {!propGroupId && treasuryGroups.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="treasury-group-select" className="text-xs font-bold uppercase text-ink/60">
              Group:
            </label>
            <select
              id="treasury-group-select"
              value={activeGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="rounded-xl border-3 border-ink bg-paper px-3 py-2 text-sm font-bold shadow-brutal-sm focus:outline-none"
            >
              {treasuryGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Treasury Overview Card */}
      <Card className="border-3 border-ink bg-paper p-5 shadow-brutal">
        <CardContent className="p-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink/10 pb-4">
            <div>
              <span className="text-xs font-mono uppercase text-ink/60">Multisig Protection</span>
              <div className="flex items-center gap-2 mt-1">
                <ShieldCheck className="h-5 w-5 text-grape" />
                <span className="font-display text-lg uppercase tracking-tight">
                  Threshold: {requiredSigners} of {totalSigners} Signatures
                </span>
              </div>
            </div>
            {info.data?.publicKey && (
              <div className="text-left sm:text-right">
                <span className="text-xs font-mono uppercase text-ink/60">Treasury Account</span>
                <div className="mt-1">
                  <PubkeyChip publicKey={info.data.publicKey} />
                </div>
              </div>
            )}
          </div>

          {/* Balances list */}
          <div>
            <span className="text-xs font-mono uppercase text-ink/60">Vault Balances</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
              {(info.data?.balances ?? []).length > 0 ? (
                info.data!.balances.map((b) => (
                  <div
                    key={b.assetCode}
                    className="flex items-center justify-between p-3 rounded-xl border-2 border-ink bg-cream shadow-brutal-sm"
                  >
                    <div className="flex items-center gap-2">
                      <AssetBadge code={b.assetCode} />
                      <span className="font-bold text-sm">{b.assetCode}</span>
                    </div>
                    <span className="font-mono font-bold text-sm">
                      <Money value={b.balance} assetCode={b.assetCode} assetIssuer={b.assetIssuer} />
                    </span>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-2 text-xs text-ink/50 italic">
                  {info.isLoading ? "Loading balances..." : "No funds currently in vault."}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approvals / Payouts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg uppercase tracking-tight">
              Approval Queue ({pendingTransactions.length})
            </h3>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={filter === "pending" ? "primary" : "outline"}
              onClick={() => setFilter("pending")}
            >
              Pending ({pendingTransactions.length})
            </Button>
            <Button
              size="sm"
              variant={filter === "all" ? "primary" : "outline"}
              onClick={() => setFilter("all")}
            >
              All History
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                info.refetch();
                history.refetch();
              }}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {displayedTransactions.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-8 w-8 text-grape" />}
            title={filter === "pending" ? "All approvals complete" : "No transactions found"}
            description={
              filter === "pending"
                ? "There are no pending multi-sig payouts requiring approval in this treasury."
                : "No treasury deposits or payouts have been recorded yet."
            }
          />
        ) : (
          <div className="grid gap-4" data-testid="treasury-tx-list">
            {displayedTransactions.map((tx) => {
              const isPending = tx.status === "pending";
              // Simulate or compute threshold progress (e.g., 1 of required signatures)
              const signaturesCount = isPending ? 1 : requiredSigners;
              const progressPct = Math.min(100, Math.round((signaturesCount / requiredSigners) * 100));

              return (
                <Card
                  key={tx.id}
                  className="border-3 border-ink bg-paper p-5 transition-all hover:shadow-brutal"
                  data-testid={`treasury-tx-${tx.id}`}
                >
                  <CardContent className="p-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Left: Tx details */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={isPending ? "butter" : tx.status === "confirmed" ? "lime" : "paper"}>
                          {tx.status.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-xs text-ink/60">
                          <Timestamp value={tx.createdAt} />
                        </span>
                        <AssetBadge code={tx.assetCode} />
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-xl uppercase">
                          {tx.direction === "deposit" ? "+" : "-"}
                          {formatStellarAssetAmount(tx.amount, tx).text}
                        </span>
                      </div>

                      {tx.destination && (
                        <div className="flex items-center gap-1.5 text-xs text-ink/70">
                          <span className="font-bold">Destination:</span>
                          <PubkeyChip publicKey={tx.destination} />
                        </div>
                      )}

                      {tx.memo && (
                        <p className="text-xs font-mono text-ink/80 bg-cream p-1.5 rounded-lg border border-ink/20 inline-block">
                          Memo: {tx.memo}
                        </p>
                      )}

                      {/* Threshold Progress Bar */}
                      {isPending && (
                        <div className="space-y-1 pt-1 max-w-xs">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="font-bold text-ink">Signatures:</span>
                            <span className="font-bold text-grape">
                              {signaturesCount} of {requiredSigners} collected
                            </span>
                          </div>
                          <div className="w-full h-2.5 rounded-full bg-ink/10 border border-ink overflow-hidden">
                            <div
                              className="h-full bg-aqua transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 pt-2 md:pt-0">
                      {isPending && (
                        <Button
                          onClick={() => handleApprove(tx)}
                          disabled={signingTxId === tx.id}
                          className="w-full md:w-auto"
                          data-testid={`approve-btn-${tx.id}`}
                        >
                          {signingTxId === tx.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Signing...
                            </>
                          ) : (
                            <>
                              <FileSignature className="h-4 w-4 mr-1" /> Approve & Sign
                            </>
                          )}
                        </Button>
                      )}
                      {tx.stellarTxHash && (
                        <TxLink hash={tx.stellarTxHash} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
export default TreasuryDashboard;
