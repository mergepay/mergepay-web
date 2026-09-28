"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2, RefreshCw, Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AssetBadge } from "@/components/asset-badge";
import { Input, Label, FieldHint, FormError } from "@/components/ui/input";
import { useAnchorInfo, findAnchorForAsset, anchorSupportsAsset } from "@/lib/anchorInfo";
import { api } from "@/lib/api";
import { anchorTransferFieldErrors, buildAnchorTransferPayload } from "@/lib/validations/anchor";
import { ANCHOR_POLL_INTERVAL_MS } from "@/lib/anchor-state";
import type { AnchorSession, AnchorSessionKind, AnchorSessionStatus } from "@/lib/types";

type ModalState = "idle" | "selecting_asset" | "configuring" | "starting" | "interactive" | "polling" | "completed" | "failed";

export interface AnchorDepositWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  assetCode: string;
  kind: AnchorSessionKind;
  preferredAnchorName?: string | null;
  onSessionStarted?: (session: AnchorSession) => void;
  onInteractiveUrl?: (url: string | null, sessionId: string) => void;
}

export function AnchorDepositWithdrawModal({
  open,
  onClose,
  assetCode,
  kind,
  preferredAnchorName,
  onSessionStarted,
  onInteractiveUrl,
}: AnchorDepositWithdrawModalProps) {
  const { anchors, isLoading, isError, refetch } = useAnchorInfo(assetCode);

  const [modalState, setModalState] = useState<ModalState>("idle");
  const [selectedAsset, setSelectedAsset] = useState(assetCode);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [transfer, setTransfer] = useState({ amount: "", destination: "", memo: "" });
  const [session, setSession] = useState<AnchorSession | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const matchingAnchors = useMemo(
    () => anchors.filter((a) => anchorSupportsAsset(a, selectedAsset)),
    [anchors, selectedAsset]
  );

  const chosenAnchor = useMemo(
    () => findAnchorForAsset(matchingAnchors, selectedAsset, selectedAnchor ?? preferredAnchorName),
    [matchingAnchors, selectedAsset, selectedAnchor, preferredAnchorName]
  );

  const transferErrors = useMemo(
    () =>
      anchorTransferFieldErrors({
        kind,
        assetCode: selectedAsset,
        anchorName: chosenAnchor?.name ?? "",
        amount: transfer.amount,
        destination: transfer.destination,
        memo: transfer.memo,
      }),
    [kind, selectedAsset, chosenAnchor, transfer]
  );

  const transferInvalid = Boolean(
    transferErrors.amount || transferErrors.destination || transferErrors.memo
  );

  const canStart = chosenAnchor != null && !transferInvalid && modalState !== "starting";

  const isTerminalState = modalState === "completed" || modalState === "failed";

  function resetModal() {
    setModalState("idle");
    setSelectedAsset(assetCode);
    setSelectedAnchor(null);
    setTransfer({ amount: "", destination: "", memo: "" });
    setSession(null);
    setErrorMessage("");
  }

  function handleAssetSelect(code: string) {
    setSelectedAsset(code);
    setSelectedAnchor(null);
    setTransfer({ amount: "", destination: "", memo: "" });
    setModalState("selecting_asset");
  }

  function handleAnchorSelect(name: string) {
    setSelectedAnchor(name);
    setModalState("configuring");
  }

  function handleFieldChange(field: "amount" | "destination" | "memo", value: string) {
    setTransfer((prev) => ({ ...prev, [field]: value }));
  }

  async function handleStart() {
    if (!chosenAnchor || transferInvalid) return;
    setModalState("starting");
    setErrorMessage("");
    try {
      const payload = buildAnchorTransferPayload({
        assetCode: selectedAsset,
        anchorName: chosenAnchor.name,
        amount: transfer.amount,
        destination: transfer.destination,
        memo: transfer.memo,
      });
      const response =
        kind === "deposit"
          ? await api.anchorDeposit(payload)
          : await api.anchorWithdraw(payload);
      setSession(response.session);
      setModalState("interactive");
      onSessionStarted?.(response.session);
      onInteractiveUrl?.(response.session.interactiveUrl, response.session.id);

      if (response.session.interactiveUrl) {
        setModalState("polling");
        void startPolling(response.session.id);
      } else {
        toast.success(
          `${kind === "deposit" ? "Deposit" : "Withdrawal"} session started with ${chosenAnchor.name}`
        );
        setModalState("completed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not start the SEP-24 session.";
      setErrorMessage(message);
      setModalState("failed");
      toast.error(message);
    }
  }

  function startPolling(sessionId: string) {
    const poll = async () => {
      try {
        const response = await api.getAnchorSession(sessionId);
        const s = response.session;
        setSession(s);
        if (isTerminalAnchorStatus(s.status)) {
          if (s.status === "completed") {
            toast.success("Transfer completed successfully");
            setModalState("completed");
          } else {
            toast.error(`Transfer ended with status: ${s.status}`);
            setModalState("failed");
          }
          return;
        }
        setModalState("polling");
      } catch {
        setModalState("polling");
      }
    };
    void poll();
    const interval = setInterval(poll, ANCHOR_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }

  function handleClosePopup() {
    resetModal();
    onClose();
  }

  function handleRetry() {
    setModalState("configuring");
    setErrorMessage("");
  }

  const stateLabel = modalState === "completed" ? "Completed" : modalState === "failed" ? "Failed" : null;

  const isStarting = modalState === "starting";
  const isConfiguring = modalState === "configuring" || modalState === "idle" || modalState === "selecting_asset";

  return (
    <Dialog
      open={open}
      onClose={isTerminalState ? handleClosePopup : onClose}
      title={`${kind === "deposit" ? "Deposit" : "Withdraw"} ${selectedAsset}`}
      description={`SEP-24 ${kind} flow — secure, anchor-hosted transfer`}
    >
      <div className="space-y-4">
        {/* Direction header */}
        <div className="flex items-center gap-3 rounded-xl border-3 border-ink bg-paper p-3.5 shadow-brutal-sm">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink ${
              kind === "deposit" ? "bg-lime" : "bg-aqua"
            }`}
          >
            {kind === "deposit" ? (
              <ArrowDownToLine className="h-4 w-4 text-ink" />
            ) : (
              <ArrowUpFromLine className="h-4 w-4 text-ink" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-ink">
              {kind === "deposit" ? "Fund your balance" : "Withdraw to fiat"}
            </p>
            <p className="text-xs text-ink/60">
              The anchor will host a secure interactive transfer.
            </p>
          </div>
          <AssetBadge code={selectedAsset} />
        </div>

        {/* State banner for terminal states */}
        {stateLabel && (
          <div
            role="alert"
            className={`rounded-xl border-3 border-ink p-4 text-center font-display font-bold ${
              modalState === "completed"
                ? "bg-lime text-ink"
                : "bg-flamingo-pale text-ink"
            }`}
          >
            {stateLabel}
            {modalState === "failed" && errorMessage && (
              <p className="mt-1 text-xs font-body text-ink/70">{errorMessage}</p>
            )}
            {modalState === "completed" && session && (
              <p className="mt-1 text-xs font-body text-ink/70">
                Session {session.id}
              </p>
            )}
          </div>
        )}

        {/* Asset selection */}
        {(modalState === "idle" || modalState === "selecting_asset" || modalState === "configuring") && (
          <div className="space-y-2">
            <p className="font-display text-xs uppercase tracking-widest text-ink/60">
              Select asset
            </p>
            <div className="flex gap-2">
              {["XLM", "USDC"].map((code) => {
                const isActive = selectedAsset === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleAssetSelect(code)}
                    aria-pressed={isActive}
                    className={`flex-1 rounded-xl border-3 border-ink p-3 text-center transition-all duration-100 ${
                      isActive
                        ? "bg-ink shadow-brutal-lg -translate-y-0.5"
                        : "bg-cream hover:bg-paper shadow-brutal-sm"
                    }`}
                  >
                    <AssetBadge code={code} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-cream p-4 text-sm text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading anchor options…</span>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-flamingo-pale p-3.5 text-xs font-bold"
          >
            <span className="flex items-center gap-2 text-ink">
              <AlertTriangle className="h-4 w-4 shrink-0 text-flamingo" />
              Could not load anchor information.
            </span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        )}

        {/* No anchors found */}
        {!isLoading && !isError && matchingAnchors.length === 0 && (
          <div
            role="alert"
            className="rounded-xl border-2 border-ink bg-butter-pale p-4 text-xs text-ink/75"
          >
            No anchors currently support{" "}
            <span className="font-bold text-grape">{selectedAsset}</span>. Try a
            different asset or check back later.
          </div>
        )}

        {/* Anchor picker */}
        {!isLoading && !isError && matchingAnchors.length > 0 && (modalState === "configuring" || modalState === "idle" || modalState === "selecting_asset") && (
          <div className="space-y-2">
            <p className="font-display text-xs uppercase tracking-widest text-ink/60">
              Choose an anchor
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {matchingAnchors.map((anchor) => {
                const selected = chosenAnchor?.name === anchor.name;
                return (
                  <li key={anchor.homeDomain}>
                    <button
                      type="button"
                      onClick={() => handleAnchorSelect(anchor.name)}
                      aria-pressed={selected}
                      className={`w-full rounded-xl border-3 border-ink p-3 text-left transition-all duration-100 ${
                        selected
                          ? "bg-paper shadow-brutal-lg -translate-y-0.5"
                          : "bg-cream hover:bg-paper shadow-brutal-sm"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-ink">
                          {anchor.name}
                        </span>
                        {selected && (
                          <Badge tone="lime" className="shrink-0">
                            Selected
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-ink/50">
                        {anchor.homeDomain}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Transfer fields */}
        {(modalState === "configuring" || modalState === "starting" || modalState === "interactive" || modalState === "polling") && chosenAnchor && (
          <div className="space-y-3">
            <p className="font-display text-xs uppercase tracking-widest text-ink/60">
              Transfer details
            </p>
            <div>
              <Label htmlFor="anchor-amount">Amount ({selectedAsset})</Label>
              <Input
                id="anchor-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 25.00"
                value={transfer.amount}
                onChange={(event) => handleFieldChange("amount", event.target.value)}
                disabled={modalState === "starting" || modalState === "polling"}
                aria-invalid={Boolean(transferErrors.amount)}
                aria-describedby={
                  transferErrors.amount ? "anchor-amount-error" : "anchor-amount-hint"
                }
              />
              {transferErrors.amount ? (
                <div id="anchor-amount-error" role="alert">
                  <FormError>{transferErrors.amount}</FormError>
                </div>
              ) : (
                <div id="anchor-amount-hint">
                  <FieldHint>Optional. Prefills the anchor's transfer page.</FieldHint>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="anchor-destination">Destination account</Label>
              <Input
                id="anchor-destination"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="G… 56-character Stellar public key"
                className="font-mono text-sm"
                value={transfer.destination}
                onChange={(event) => handleFieldChange("destination", event.target.value)}
                disabled={modalState === "starting" || modalState === "polling"}
                aria-invalid={Boolean(transferErrors.destination)}
                aria-describedby={
                  transferErrors.destination
                    ? "anchor-destination-error"
                    : "anchor-destination-hint"
                }
              />
              {transferErrors.destination ? (
                <div id="anchor-destination-error" role="alert">
                  <FormError>{transferErrors.destination}</FormError>
                </div>
              ) : (
                <div id="anchor-destination-hint">
                  <FieldHint>
                    {kind === "deposit"
                      ? "Optional. The Stellar account the anchor should fund."
                      : "Optional. The Stellar account the payout should reach."}
                  </FieldHint>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="anchor-memo">Memo</Label>
              <Input
                id="anchor-memo"
                type="text"
                autoComplete="off"
                placeholder="e.g. rent-september"
                className="font-mono text-sm"
                value={transfer.memo}
                onChange={(event) => handleFieldChange("memo", event.target.value)}
                disabled={modalState === "starting" || modalState === "polling"}
                aria-invalid={Boolean(transferErrors.memo)}
                aria-describedby={
                  transferErrors.memo ? "anchor-memo-error" : "anchor-memo-hint"
                }
              />
              {transferErrors.memo ? (
                <div id="anchor-memo-error" role="alert">
                  <FormError>{transferErrors.memo}</FormError>
                </div>
              ) : (
                <div id="anchor-memo-hint">
                  <FieldHint>Optional. Attached to the on-chain payment, up to 28 bytes.</FieldHint>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Polling status */}
        {modalState === "polling" && (
          <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-cream p-4 text-sm text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking transfer status…</span>
          </div>
        )}

        {/* Interactive URL indicator */}
        {modalState === "interactive" && session?.interactiveUrl && (
          <div className="rounded-xl border-3 border-ink bg-paper p-4 shadow-brutal-sm">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-ink" />
              <p className="text-sm font-bold text-ink">Interactive session active</p>
            </div>
            <a
              href={session.interactiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3 w-3" /> Open in new tab
              </Button>
            </a>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={isTerminalState ? handleClosePopup : onClose} disabled={modalState === "starting" || modalState === "polling"}>
            <X className="h-4 w-4" /> {isTerminalState ? "Close" : "Cancel"}
          </Button>
          {modalState === "failed" && (
            <Button variant="outline" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          )}
          {isConfiguring && (
            <Button
              onClick={() => void handleStart()}
              disabled={!chosenAnchor || transferInvalid}
              loading={isStarting}
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : chosenAnchor ? (
                <Rocket className="h-4 w-4" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {kind === "deposit" ? "Start Deposit" : "Start Withdrawal"}
            </Button>
          )}
          {modalState === "interactive" && (
            <Button onClick={() => void handleStart()} variant="primary">
              <Loader2 className="h-4 w-4 animate-spin" /> Continue
            </Button>
          )}
          {isTerminalState && (
            <Button onClick={handleClosePopup}>
              Close
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function isTerminalAnchorStatus(status: AnchorSessionStatus): boolean {
  return status === "completed" || status === "error" || status === "refunded";
}