import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "grape"
  | "lime"
  | "tangerine"
  | "flamingo"
  | "aqua"
  | "butter"
  | "ink"
  | "paper";

const tones: Record<Tone, string> = {
  grape: "bg-grape-pale text-grape-dark",
  lime: "bg-lime-pale text-ink",
  tangerine: "bg-tangerine-pale text-tangerine-dark",
  flamingo: "bg-flamingo-pale text-ink",
  aqua: "bg-aqua-pale text-ink",
  butter: "bg-butter-pale text-ink",
  ink: "bg-ink text-lime",
  paper: "bg-paper text-ink",
};

export function Badge({
  className,
  tone = "grape",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border-2 border-ink rounded-lg px-2 py-0.5 font-display text-[10px] uppercase tracking-widest shadow-brutal-sm",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "settled":
    case "confirmed":
    case "completed":
      return "lime";
    case "settling":
    case "submitted":
    case "pending_user_transfer_start":
    case "pending_anchor":
    case "awaiting_signatures":
      return "butter";
    case "failed":
    case "error":
      return "flamingo";
    default:
      return "paper";
  }
}
