"use client";

/**
 * Shared progress feedback for on-chain submissions (#545).
 *
 * A Stellar transaction takes several seconds and passes through legs the user
 * can't see: building the envelope, waiting for a Freighter signature,
 * submitting, then waiting for the network to show the result. These pieces
 * make that visible, and they are the same pieces `SettlementModal` already
 * used — lifted out of that file so every submission surface in the app reads
 * identically instead of hand-rolling its own spinner.
 *
 * All three are presentational: they take a step list and a count of completed
 * steps (`walletSubmission.ts` owns that mapping) and know nothing about
 * wallets, queries, or which transaction is running.
 *
 * Motion follows the app's existing convention — `framer-motion` for the
 * transitions, with `useReducedMotion()` collapsing them to none, since a
 * filling bar is information and should never be the reason someone can't
 * follow along.
 */

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TxStepItem {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

export interface TxProgressProps {
  steps: readonly TxStepItem[];
  /**
   * How many steps are finished. `0` = just started, `steps.length` = all
   * done. The step at this index is the one in progress, which is why a
   * failure colours *that* one.
   */
  completed: number;
  /** Colour the in-progress step as failed rather than active. */
  errored?: boolean;
  /** Accessible name for the list, e.g. "Settlement progress". */
  label?: string;
  className?: string;
}

/**
 * A row of labelled bars that fill left to right as a submission advances.
 *
 * `initial={false}` matters: these components mount mid-flow (a dialog that
 * re-renders on each phase), and an entering animation from zero would replay
 * progress the user already watched.
 */
export function TxProgress({
  steps,
  completed,
  errored = false,
  label = "Transaction progress",
  className,
}: TxProgressProps) {
  const reduceMotion = useReducedMotion();
  /** A step is drawn once it is current or finished; future steps stay empty. */
  const isFilled = (i: number) => i <= completed;
  const tone = (i: number) =>
    i < completed
      ? "bg-ink"
      : i === completed
        ? errored
          ? "bg-flamingo"
          : "bg-lime"
        : "bg-transparent";

  return (
    <ol
      role="list"
      aria-label={label}
      className={cn("grid gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, i) => {
        const current = i === completed;
        const done = i < completed;
        return (
          <li key={step.id} aria-current={current ? "step" : undefined} className="min-w-0">
            <div className="h-2 overflow-hidden rounded-full border-2 border-ink bg-cream">
              <motion.div
                initial={false}
                animate={{ scaleX: isFilled(i) ? 1 : 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }}
                className={cn("h-full origin-left transition-colors", tone(i))}
                aria-hidden="true"
              />
            </div>
            <span
              className={cn(
                "mt-1 block truncate font-display text-[10px] uppercase tracking-widest",
                current ? "text-ink" : "text-ink/50"
              )}
            >
              {step.label}
            </span>
            <span className="sr-only">
              {done ? "complete" : current ? (errored ? "failed" : "in progress") : "not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Status panel
// ---------------------------------------------------------------------------

export interface TxStatusPanelProps {
  tone: "grape" | "butter";
  icon: ReactNode;
  title: string;
  body: string;
  footer?: ReactNode;
  /**
   * Marks the region busy for assistive tech — set it while work is in flight
   * and clear it on a terminal state, so a screen reader stops announcing
   * updates once the outcome is known.
   */
  live?: boolean;
  className?: string;
}

/**
 * Centred status card for a submission step, announced politely so it never
 * interrupts what the user is doing. `role="status"` plus `aria-live="polite"`
 * is the contract the settle modal already relies on.
 */
export function TxStatusPanel({
  tone,
  icon,
  title,
  body,
  footer,
  live = false,
  className,
}: TxStatusPanelProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border-3 border-ink px-4 py-6 text-center shadow-brutal-sm",
        tone === "grape" ? "bg-grape-pale" : "bg-butter-pale",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy={live || undefined}
    >
      <motion.span
        key={title}
        initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
        className="text-grape"
        aria-hidden="true"
      >
        {icon}
      </motion.span>
      <p className="font-display text-sm uppercase tracking-tight">{title}</p>
      <p className="max-w-xs text-xs text-ink/70">{body}</p>
      {footer && <div className="flex flex-col items-center gap-2">{footer}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact phase readout
// ---------------------------------------------------------------------------

export interface TxPhaseLineProps {
  /** The descriptive label for the current phase (`phaseLabelFor`). */
  text: string;
  /** Terminal state to colour the row: still working, done, or failed. */
  state: "busy" | "done" | "error";
  /** Extra content after the label — a tx link, a retry button. */
  children?: ReactNode;
  className?: string;
}

/**
 * A single live line of status text for compact surfaces — a banner row or a
 * dialog list item, where the full panel would be too much furniture.
 *
 * The label fades in as it changes, which is what makes a four-step flow
 * readable rather than flickery, but it always shows the *current* phase the
 * moment it changes (see the note in the body). It is a live region: the phase
 * text is the news.
 */
export function TxPhaseLine({
  text,
  state,
  children,
  className,
}: TxPhaseLineProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 text-xs", className)}
      role="status"
      aria-live="polite"
      aria-busy={state === "busy" || undefined}
    >
      {/*
        Keyed on the text so each phase is a fresh element that fades in. There
        is deliberately no exit animation: `AnimatePresence mode="wait"` would
        hold the *previous* label on screen while it fades, and a live region
        that reads out a phase it has already left behind is worse than no
        animation at all — this text is the news, not decoration.
      */}
      <motion.span
        key={text}
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        className={cn(
          "font-medium",
          state === "error" ? "text-flamingo" : state === "done" ? "text-lime-dark" : "text-ink/70"
        )}
      >
        {text}
      </motion.span>
      {children}
    </div>
  );
}
