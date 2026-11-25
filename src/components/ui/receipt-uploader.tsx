"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";
import { ImagePlus, Loader2, RefreshCw, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MAX_RECEIPT_BYTES,
  RECEIPT_EXTENSIONS,
  formatBytes,
  prepareReceiptFile,
  validateReceiptFile,
} from "@/lib/receipt";

interface AttachedPreview {
  name: string;
  size: number;
  compressed: boolean;
  objectUrl: string;
}

/**
 * Neobrutalist file picker + drag-and-drop dropzone for an expense receipt.
 *
 * Supports click-to-browse and drag-and-drop, restricts to the image types
 * Mergepay accepts (JPG / PNG / WEBP), enforces the size ceiling, and compresses
 * large images in the browser before handing the file back to the parent for
 * upload.
 */
export function ReceiptUploader({
  value,
  onSelect,
  onClear,
  disabled = false,
  label,
}: {
  /** Currently attached receipt URL (from a previous upload). */
  value?: string | null;
  /** Callback with the compressed `File` ready for `api.uploadReceipt`. */
  onSelect: (file: File) => void;
  /** Called when the user removes the attached receipt. */
  onClear: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attached, setAttached] = useState<AttachedPreview | null>(null);
  const [busy, setBusy] = useState(false);

  // Teardown the object URL we created so we never leak it.
  useEffect(() => {
    return () => {
      if (attached) URL.revokeObjectURL(attached.objectUrl);
    };
  }, [attached]);

  const pick = useCallback(
    async (file: File | undefined) => {
      if (!file || disabled) return;

      // Cheap validation before decoding the payload.
      const validation = validateReceiptFile(file);
      if (!validation.ok) {
        toast.error(validation.message);
        return;
      }

      setBusy(true);
      try {
        const prepared = await prepareReceiptFile(file);
        const objectUrl = URL.createObjectURL(prepared.file);
        setAttached({
          name: prepared.file.name,
          size: prepared.file.size,
          compressed: prepared.compressed,
          objectUrl,
        });
        onSelect(prepared.file);
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : "That image couldn't be read.";
        toast.error(message);
      } finally {
        setBusy(false);
        // Reset so the same file can be re-picked after a fix.
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [disabled, onSelect]
  );

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void pick(e.target.files?.[0]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    void pick(e.dataTransfer.files?.[0]);
  }

  function onRemove() {
    setAttached(null);
    onClear();
  }

  const showAttached = Boolean(value || attached);

  return (
    <div className={cn("space-y-1.5", disabled && "opacity-60")}>
      {showAttached ? (
        <div className="flex items-center gap-3 rounded-xl border-3 border-ink bg-butter p-3 shadow-brutal-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-ink bg-white shadow-brutal-sm">
            {attached?.objectUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attached.objectUrl}
                alt="Receipt preview thumbnail"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImagePlus className="h-5 w-5 text-ink/50" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xs uppercase tracking-wide">
              {attached?.name ?? "Receipt attached"}
            </p>
            {attached?.compressed && (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-ink/20 bg-lime-pale px-1.5 py-0.5 font-mono text-[10px]">
                <RefreshCw className="h-2.5 w-2.5" /> compressed ·{" "}
                {formatBytes(attached.size)}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={disabled || busy}
            aria-label="Remove receipt"
            className="h-8 w-8 p-0 text-ink"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-label="Add a receipt image"
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={cn(
            "group flex cursor-pointer flex-col items-center gap-2 rounded-xl border-3 border-dashed border-ink bg-paper px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40",
            dragOver && "bg-lime-pale shadow-brutal",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-grape" />
              <span className="font-display text-xs uppercase tracking-wide">
                Optimizing…
              </span>
            </>
          ) : (
            <>
              <UploadCloud
                className={cn(
                  "h-7 w-7",
                  dragOver ? "text-grape" : "text-ink/50 group-hover:text-grape"
                )}
              />
              <span className="font-display text-sm uppercase tracking-wide">
                {label ?? "Drop a receipt image"}
              </span>
              <span className="max-w-[30ch] text-[11px] text-ink/60">
                or click to browse · {RECEIPT_EXTENSIONS.join(" / ")} · max{" "}
                {formatBytes(MAX_RECEIPT_BYTES)} · large images are compressed
              </span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onChange}
        disabled={disabled}
        aria-label="Choose a receipt image (JPG, PNG or WEBP)"
      />
    </div>
  );
}