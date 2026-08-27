"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { useAnchorSessions } from "@/lib/queries";
import type { AnchorSession } from "@/lib/types";

export function AnchorFlowModal({ session, onClose }: { session: AnchorSession | null; onClose: () => void }) {
  const sessions = useAnchorSessions();
  const [blocked, setBlocked] = useState(false);
  const current = session ? sessions.data?.sessions.find((s) => s.id === session.id) ?? session : null;
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => sessions.refetch(), 5000);
    return () => window.clearInterval(timer);
  }, [session, sessions.refetch]);
  useEffect(() => { if (current?.status === "completed" || current?.status === "error" || current?.status === "refunded") setBlocked(false); }, [current?.status]);
  if (!current) return null;
  const terminal = ["completed", "error", "refunded"].includes(current.status);
  return <Dialog open onClose={onClose} title={`${current.kind === "deposit" ? "Deposit" : "Withdraw"} ${current.assetCode}`} description="Complete the secure SEP-24 transfer with the anchor.">
    <div className="space-y-3">
      <div className="flex items-center justify-between"><span className="text-sm text-ink/60">{current.anchorName}</span><Badge tone={statusTone(current.status)}>{current.status.replace(/_/g, " ")}</Badge></div>
      {current.interactiveUrl && !blocked && !terminal ? <iframe title="Anchor interactive transfer" src={current.interactiveUrl} className="h-[min(60vh,34rem)] w-full rounded-xl border-3 border-ink bg-white" onError={() => setBlocked(true)} /> : <div className="rounded-xl border-2 border-ink bg-butter-pale p-4 text-sm">{terminal ? `Transfer ${current.status === "completed" ? "completed successfully" : "ended with status: " + current.status}.` : "This anchor cannot be embedded. Continue in a secure external window."}</div>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button>{current.interactiveUrl && (!blocked || terminal) && !terminal && <a href={current.interactiveUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline">Open externally</Button></a>}{blocked && current.interactiveUrl && <a href={current.interactiveUrl} target="_blank" rel="noopener noreferrer"><Button>Continue securely</Button></a>}</div>
    </div>
  </Dialog>;
}
