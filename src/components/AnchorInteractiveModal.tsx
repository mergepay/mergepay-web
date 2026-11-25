"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnchorSession } from "@/lib/queries";
import { getStateDescription, mapAnchorStatusToUiState } from "@/lib/anchor-state";

export function AnchorInteractiveModal({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const query = useAnchorSession(sessionId);
  const session = query.data?.session;
  const uiState = session ? mapAnchorStatusToUiState(session.status) : "unknown";
  const [open, setOpen] = useState(Boolean(sessionId));

  useEffect(() => {
    setOpen(Boolean(sessionId));
  }, [sessionId]);

  const isOpen = Boolean(sessionId) && open;

  function close() {
    setOpen(false);
    onClose();
  }

  return (
    <Dialog open={isOpen} onClose={close} title="Complete anchor transfer" className="max-w-4xl">
      {query.isLoading && <p className="p-6 text-sm">Loading anchor session...</p>}
      {query.isError && (
        <div className="space-y-3 p-6">
          <p className="font-bold">We could not refresh this transfer.</p>
          <Button variant="outline" onClick={() => query.refetch()}>Retry</Button>
        </div>
      )}
      {session && (
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink/10 pb-3">
            <p className="font-bold capitalize">{session.kind} · {session.assetCode}</p>
            <Badge tone={statusTone(session.status)}>{session.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-ink/70">{getStateDescription(uiState)}</p>
          {session.interactiveUrl && uiState === "pending" && (
            <iframe
              title="Anchor transfer"
              src={session.interactiveUrl}
              className="h-[min(65vh,36rem)] w-full rounded-xl border-3 border-ink bg-white"
              sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
            />
          )}
          {session.interactiveUrl && (
            <a href={session.interactiveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button variant="outline"><ExternalLink className="h-4 w-4" /> Open in new tab</Button>
            </a>
          )}
        </div>
      )}
    </Dialog>
  );
}
