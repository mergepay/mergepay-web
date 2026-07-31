import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TxLink } from "@/components/tx-link";
import { fullDate } from "@/lib/format";
import {
  describeSettlementStatus,
  hasTransactionMetadata,
  type SettlementStatusKind,
} from "@/lib/settlementStatusDisplay";
import type { Settlement } from "@/lib/types";

const KIND_ICONS: Record<SettlementStatusKind, LucideIcon> = {
  pending: Clock,
  completed: CheckCircle2,
  failed: AlertTriangle,
  unknown: HelpCircle,
};

/**
 * Status badge for a settlement. The label is text — the tone is only a
 * reinforcement — so the three states stay distinguishable without
 * relying on colour.
 */
export function SettlementStatusBadge({ status }: { status: string }) {
  const view = describeSettlementStatus(status);
  const Icon = KIND_ICONS[view.kind];
  return (
    <Badge tone={view.tone}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {view.label}
    </Badge>
  );
}

/**
 * Full status block for one settlement record: what state it is in, what
 * happened last, the transaction metadata when the API has it, and — for
 * a failed payment only — a safe route back into the group where a fresh
 * settlement can be built and signed.
 *
 * There is deliberately no "retry" action here. A settlement is signed
 * against a transaction the API builds for the current balance; re-sending
 * an old one would either fail or pay twice, so recovery is a link into
 * the group rather than a one-click resubmit.
 */
export function SettlementStatusDetail({
  settlement,
  className,
}: {
  settlement: Settlement;
  className?: string;
}) {
  const view = describeSettlementStatus(settlement.status);
  const showTx = hasTransactionMetadata(settlement);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <SettlementStatusBadge status={settlement.status} />
        {showTx && settlement.stellarTxHash && (
          <TxLink hash={settlement.stellarTxHash} />
        )}
      </div>

      <p className="mt-1 text-xs text-ink/60">{view.detail}</p>

      {view.kind === "completed" && (
        <p className="mt-0.5 text-xs text-ink/50">
          Confirmed {fullDate(settlement.createdAt)}
        </p>
      )}

      {view.kind === "failed" && (
        <p className="mt-0.5 text-xs text-ink/50">
          Attempted {fullDate(settlement.createdAt)}
          {showTx && " — the reference above shows what the network recorded."}
        </p>
      )}

      {view.canRecover && (
        <Link
          href={`/groups/${settlement.groupId}`}
          className="mt-1 inline-block text-xs font-bold text-grape underline underline-offset-2 hover:text-grape-dark"
        >
          Review balances and settle again
        </Link>
      )}
    </div>
  );
}
