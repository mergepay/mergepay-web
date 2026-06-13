"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, FieldHint } from "@/components/ui/input";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { PubkeyChip, TxLink } from "@/components/tx-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { StrKey } from "@/lib/strkey";
import {
  useEnableTreasury,
  useTreasuryDeposit,
  useTreasuryHistory,
  useTreasuryInfo,
  useTreasuryWithdraw,
} from "@/lib/queries";
import { api, ApiRequestError } from "@/lib/api";
import { signAndConfirmTreasuryTx, WalletError } from "@/lib/stellar";
import { SETTLEMENT_ASSETS, STABLE_ASSET } from "@/lib/constants";
import { fullDate } from "@/lib/format";
import type { Group, GroupDetail } from "@/lib/types";

export function TreasuryPanel({
  group,
  detail,
}: {
  group: Group;
  detail: GroupDetail;
}) {
  const isAdmin = detail.yourRole === "admin";
  const [enableOpen, setEnableOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const info = useTreasuryInfo(group.id, group.treasuryEnabled);
  const history = useTreasuryHistory(group.id, group.treasuryEnabled);

  if (!group.treasuryEnabled) {
    return (
      <>
        <EmptyState
          icon={<Landmark className="h-7 w-7" />}
          title="Treasury not enabled"
          description="Pool funds for recurring expenses in a shared Stellar wallet. Withdrawals can require multiple signers for safety."
          action={
            isAdmin ? (
              <Button onClick={() => setEnableOpen(true)}>
                <Landmark className="h-4 w-4" /> Enable treasury
              </Button>
            ) : (
              <Badge tone="paper">Only an admin can enable this</Badge>
            )
          }
        />
        <EnableTreasuryDialog
          open={enableOpen}
          onClose={() => setEnableOpen(false)}
          groupId={group.id}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-ink bg-aqua px-5 py-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            <span className="font-display text-sm uppercase tracking-tight">
              Shared treasury
            </span>
          </div>
          {group.treasuryRequiredSigners && group.treasuryRequiredSigners > 1 && (
            <Badge tone="ink">
              <ShieldCheck className="h-3 w-3" /> {group.treasuryRequiredSigners}-of-N multisig
            </Badge>
          )}
        </div>
        <CardContent className="space-y-4 pt-4">
          {group.treasuryAccountPublicKey && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
                Account
              </span>
              <PubkeyChip publicKey={group.treasuryAccountPublicKey} />
            </div>
          )}

          <div>
            <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
              Balances
            </span>
            {info.isLoading ? (
              <Skeleton className="mt-2 h-10 w-full" />
            ) : info.data?.balances.length ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {info.data.balances.map((b) => (
                  <div
                    key={`${b.assetCode}-${b.assetIssuer}`}
                    className="flex items-center justify-between rounded-xl border-2 border-ink bg-paper px-4 py-2.5"
                  >
                    <AssetBadge code={b.assetCode} />
                    <Money value={b.balance} assetCode={b.assetCode} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink/50">
                No balances yet — make a deposit to fund the treasury.
              </p>
            )}
          </div>

          {info.data?.signers && info.data.signers.length > 0 && (
            <div>
              <span className="font-display text-[10px] uppercase tracking-widest text-ink/50">
                <Users className="mr-1 inline h-3 w-3" /> Signers
              </span>
              <div className="mt-2 space-y-1.5">
                {info.data.signers.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between rounded-lg border-2 border-ink bg-cream px-3 py-1.5"
                  >
                    <PubkeyChip publicKey={s.key} />
                    <span className="font-mono text-xs text-ink/60">
                      weight {s.weight}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={() => setDepositOpen(true)} className="flex-1">
              <ArrowDownToLine className="h-4 w-4" /> Deposit
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setWithdrawOpen(true)}
                className="flex-1"
              >
                <ArrowUpFromLine className="h-4 w-4" /> Withdraw
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-3 font-display text-sm uppercase tracking-widest text-ink/60">
          Treasury activity
        </h3>
        {history.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : history.data?.transactions.length ? (
          <div className="space-y-2">
            {history.data.transactions.map((t) => (
              <Card key={t.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink ${
                      t.direction === "deposit" ? "bg-lime" : "bg-tangerine"
                    }`}
                  >
                    {t.direction === "deposit" ? (
                      <ArrowDownToLine className="h-4 w-4" />
                    ) : (
                      <ArrowUpFromLine className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <p className="font-bold capitalize">{t.direction}</p>
                    <p className="text-xs text-ink/50">{fullDate(t.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Money value={t.amount} assetCode={t.assetCode} />
                  <div className="mt-1 flex justify-end">
                    {t.stellarTxHash ? (
                      <TxLink hash={t.stellarTxHash} />
                    ) : (
                      <Badge tone="butter">{t.status.replace(/_/g, " ")}</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink/50">No treasury transactions yet.</p>
        )}
      </div>

      <DepositDialog
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        groupId={group.id}
      />
      <WithdrawDialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        groupId={group.id}
      />
    </div>
  );
}

function EnableTreasuryDialog({
  open,
  onClose,
  groupId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
}) {
  const enable = useEnableTreasury(groupId);
  const [publicKey, setPublicKey] = useState("");
  const [requiredSigners, setRequiredSigners] = useState("1");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!StrKey.isValidEd25519PublicKey(publicKey.trim())) {
      toast.error("Enter a valid Stellar public key (starts with G).");
      return;
    }
    try {
      await enable.mutateAsync({
        publicKey: publicKey.trim(),
        requiredSigners: Number(requiredSigners) || 1,
      });
      toast.success("Treasury enabled");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not enable treasury");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Enable treasury">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border-2 border-ink bg-butter-pale px-4 py-3 text-xs">
          Create a dedicated Stellar account in your wallet for the group, then
          paste its <strong>public key</strong> here. Mergepay never stores
          private keys — it only builds transactions for signers to approve.
        </div>
        <div>
          <Label htmlFor="t-pk">Treasury public key</Label>
          <Input
            id="t-pk"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="G…"
            className="font-mono text-xs"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="t-sig">Required signers for withdrawals</Label>
          <Select
            id="t-sig"
            value={requiredSigners}
            onChange={(e) => setRequiredSigners(e.target.value)}
          >
            <option value="1">1 — single signer</option>
            <option value="2">2 — dual control</option>
            <option value="3">3 — multisig</option>
          </Select>
          <FieldHint>
            Set signer weights & thresholds on the account in your wallet to match.
          </FieldHint>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={enable.isPending}>
            Enable treasury
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DepositDialog({
  open,
  onClose,
  groupId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
}) {
  const deposit = useTreasuryDeposit(groupId);
  const [amount, setAmount] = useState("");
  const [assetKey, setAssetKey] = useState("XLM");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const asset = SETTLEMENT_ASSETS.find((a) => a.code === assetKey)!;
    setBusy(true);
    try {
      const intent = await deposit.mutateAsync({
        amount,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
      });
      await signAndConfirmTreasuryTx(
        intent.treasuryTransaction.id,
        intent.xdr,
        intent.networkPassphrase
      );
      toast.success("Deposit settled on Stellar");
      onClose();
      setAmount("");
    } catch (e) {
      if (e instanceof WalletError) toast.error(e.message);
      else if (e instanceof ApiRequestError) toast.error(e.message);
      else toast.error("Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Deposit to treasury">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="d-amt">Amount</Label>
            <Input
              id="d-amt"
              type="number"
              min="0"
              step="0.0000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="d-asset">Asset</Label>
            <Select id="d-asset" value={assetKey} onChange={(e) => setAssetKey(e.target.value)}>
              <option value="XLM">XLM</option>
              <option value={STABLE_ASSET.code}>{STABLE_ASSET.code}</option>
            </Select>
          </div>
        </div>
        <FieldHint>You will sign this payment from your wallet to the treasury.</FieldHint>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!amount}>
            Sign & deposit
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function WithdrawDialog({
  open,
  onClose,
  groupId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
}) {
  const withdraw = useTreasuryWithdraw(groupId);
  const [amount, setAmount] = useState("");
  const [assetKey, setAssetKey] = useState("XLM");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!StrKey.isValidEd25519PublicKey(destination.trim())) {
      toast.error("Enter a valid destination public key.");
      return;
    }
    const asset = SETTLEMENT_ASSETS.find((a) => a.code === assetKey)!;
    setBusy(true);
    try {
      const intent = await withdraw.mutateAsync({
        amount,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        destination: destination.trim(),
      });
      // Build & sign with the treasury account in the wallet.
      await signAndConfirmTreasuryTx(
        intent.treasuryTransaction.id,
        intent.xdr,
        intent.networkPassphrase
      );
      toast.success(
        intent.treasuryTransaction.status === "awaiting_signatures"
          ? "Signed — awaiting remaining signatures"
          : "Withdrawal settled on Stellar"
      );
      onClose();
      setAmount("");
      setDestination("");
    } catch (e) {
      if (e instanceof WalletError) toast.error(e.message);
      else if (e instanceof ApiRequestError) toast.error(e.message);
      else toast.error("Withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Withdraw from treasury">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="w-amt">Amount</Label>
            <Input
              id="w-amt"
              type="number"
              min="0"
              step="0.0000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="w-asset">Asset</Label>
            <Select id="w-asset" value={assetKey} onChange={(e) => setAssetKey(e.target.value)}>
              <option value="XLM">XLM</option>
              <option value={STABLE_ASSET.code}>{STABLE_ASSET.code}</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="w-dest">Destination public key</Label>
          <Input
            id="w-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="G…"
            className="font-mono text-xs"
          />
        </div>
        <FieldHint>
          Withdrawals are signed from the treasury account. Multisig groups need
          every required signer to approve.
        </FieldHint>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!amount || !destination}>
            Sign & withdraw
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
