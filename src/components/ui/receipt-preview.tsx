"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, Maximize2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Neobrutalist lightbox for viewing an attached receipt.
 *
 * Renders the image at large scale over a dark backdrop, supports Escape /
 * backdrop-click to dismiss, traps focus, and restores page scroll when
 * closed. Includes a download and an "open full size" action.
 */
export function ReceiptPreview({
  open,
  onClose,
  url,
  title = "Receipt",
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Escape + vertical overflow guard while open.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab") {
        // Keep focus inside the lightbox.
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href]'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border-3 border-ink bg-cream shadow-brutal-xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b-3 border-ink bg-butter px-4 py-2.5 rounded-t-[13px]">
          <span className="flex min-w-0 items-center gap-2 font-display text-sm uppercase tracking-tight">
            <Maximize2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{title}</span>
          </span>
          <button
            type="button"
            onClick={closeRef.current}
            aria-label={`Close ${title}`}
            className="border-2 border-ink rounded-lg bg-cream p-1.5 shadow-brutal-sm hover:bg-flamingo transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-ink p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={title}
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            className={cn(
              "max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-brutal",
              "cursor-zoom-in"
            )}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t-3 border-ink bg-butter px-4 py-2.5 rounded-b-[13px]">
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink/60">
            {url}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <ButtonNeo
              onClick={() => {
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              aria-label="Open receipt in a new tab"
            >
              <ExternalLink className="h-4 w-4" /> Open
            </ButtonNeo>
            <ButtonNeo
              onClick={async () => {
                try {
                  const res = await fetch(url);
                  const blob = await res.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = title.toLowerCase().replace(/\s+/g, "-") || "receipt";
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => {
                    URL.revokeObjectURL(a.href);
                    a.remove();
                  }, 1000);
                } catch {
                  toast.error("Could not download this receipt.");
                }
              }}
            >
              <Download className="h-4 w-4" /> Download
            </ButtonNeo>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Inline neobrutalist action button (kept local to the lightbox footer). */
function ButtonNeo({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border-2 border-ink bg-cream px-3 py-1.5 font-display text-[11px] uppercase tracking-wide shadow-brutal-sm transition-all hover:bg-lime-pale active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}