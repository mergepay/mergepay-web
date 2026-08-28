"use client";

/**
 * ExpenseReceiptModal
 *
 * Renders a shareable receipt view for a group expense, including:
 *  - Expense metadata (title, total, payer, date, memo, tx hash)
 *  - A QR code for instant peer-to-peer scanning (via qrcode.react)
 *  - Copy-to-clipboard buttons for the expense link and transaction payload
 *
 * Uses the existing Dialog component and neobrutalist UI primitives.
 * Fully keyboard-accessible: closes via Escape and backdrop click.
 */

import { useState } from "react";
import { Check, Copy, ExternalLink, FileText, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Money } from "@/components/amount";
import { AssetBadge } from "@/components/asset-badge";
import { Timestamp } from "@/components/timestamp";
import { TxLink } from "@/components/tx-link";
import { explorerTxUrl } from "@/lib/constants";
import type { Expense } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a shareable expense link.
 * Uses the current origin as the base so the link works across environments.
 */
function buildExpenseLink(expense: Expense): string {
  if (typeof window === "undefined") return "";
  const base = window.location.origin;
  return `${base}/groups/${expense.groupId}?expense=${expense.id}`;
}

/**
 * Build a machine-readable receipt payload for the QR code.
 * Encodes the essential expense data in a compact JSON format so scanners
 * can reconstruct the full context without hitting the API.
 */
function buildReceiptPayload(expense: Expense): string {
  const payload: Record<string, unknown> = {
    type: "mergepay_expense",
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    asset: expense.assetCode,
    memo: expense.memo,
    payer: expense.payer.displayName,
  };
  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyAction({
  text,
  label,
  what,
}: {
  text: string;
  label: string;
  what: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Could not copy ${what}`);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-lime-dark" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExpenseReceiptModal({
  open,
  onClose,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  expense: Expense;
}) {
  const shareLink = buildExpenseLink(expense);
  const payload = buildReceiptPayload(expense);
  const txHash = expense.memo;

  const settledCount = expense.shares.filter(
    (s) => s.status === "settled"
  ).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Receipt — ${expense.title}`}
      description={`Shareable receipt for the expense "${expense.title}" paid by ${expense.payer.displayName}.`}
    >
      <div className="space-y-5">
        {/* Expense header */}
        <div className="rounded-2xl border-3 border-ink bg-paper p-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs uppercase tracking-widest text-ink/50">
              Expense
            </span>
            <AssetBadge code={expense.assetCode} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-3 border-ink bg-butter shadow-brutal-sm">
              <Avatar user={expense.payer} />
            </span>
            <div>
              <p className="font-display text-lg uppercase tracking-tight">
                {expense.title}
              </p>
              <Money
                value={expense.amount}
                assetCode={expense.assetCode}
                className="text-2xl"
              />
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm">
            <span className="text-ink/50">Paid by</span>
            <span className="font-bold">{expense.payer.displayName}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm">
            <span className="text-ink/50">Date</span>
            <Timestamp value={expense.createdAt} />
          </div>
          <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm">
            <span className="text-ink/50">Split</span>
            <span className="capitalize">{expense.splitType}</span>
          </div>
          {expense.memo && (
            <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm">
              <span className="text-ink/50">Memo</span>
              <span className="font-mono text-xs">{expense.memo}</span>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm">
            <span className="text-ink/50">Settled</span>
            <Badge tone={statusTone(settledCount === expense.shares.length ? "settled" : "pending")}>
              {settledCount}/{expense.shares.length}
            </Badge>
          </div>
        </div>

        {/* Split breakdown */}
        <div>
          <p className="mb-2 font-display text-[10px] uppercase tracking-widest text-ink/50">
            Split breakdown
          </p>
          <div className="space-y-1.5">
            {expense.shares.map((share) => (
              <div
                key={share.id}
                className="flex items-center justify-between rounded-lg border-2 border-ink bg-cream px-3 py-1.5"
              >
                <span className="flex items-center gap-2">
                  <Avatar user={share.user} size="sm" />
                  <span className="text-sm font-bold">
                    {share.user.displayName}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Money value={share.shareAmount} assetCode={expense.assetCode} />
                  <Badge tone={statusTone(share.status)}>
                    {share.status}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center">
          <p className="mb-3 font-display text-[10px] uppercase tracking-widest text-ink/50">
            Scan to view
          </p>
          <div className="rounded-2xl border-3 border-ink bg-white p-4 shadow-brutal">
            <QRCodeCanvas
              value={shareLink || payload}
              size={200}
              level="M"
              marginSize={2}
              bgColor="#FFFFFF"
              fgColor="#18130E"
            />
          </div>
          <p className="mt-2 text-center text-[10px] text-ink/40">
            Scan this code to open the expense link on any device
          </p>
        </div>

        {/* Copy actions */}
        <div className="flex flex-wrap gap-2">
          <CopyAction text={shareLink} label="Copy link" what="expense link" />
          <CopyAction
            text={payload}
            label="Copy payload"
            what="receipt payload"
          />
          {expense.receiptUrl && (
            <a
              href={expense.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 font-display uppercase tracking-wide border-3 border-ink transition-all duration-100 select-none shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40 bg-cream text-ink text-xs px-3 py-1.5 rounded-lg"
            >
              <FileText className="h-3.5 w-3.5" /> View receipt
            </a>
          )}
        </div>
      </div>
    </Dialog>
  );
}
