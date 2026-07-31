/**
 * Behavioural rules shared by every dialog in the app.
 *
 * The DOM wiring lives in `src/components/ui/dialog.tsx`; the decisions it
 * makes — which dialog owns Escape, where focus goes when one opens, where Tab
 * wraps to — are plain functions here so they can be tested without a browser.
 */

/**
 * Elements that can hold keyboard focus. `[tabindex="-1"]` is deliberately
 * excluded: those are programmatic focus targets (such as the dialog panel
 * itself), not Tab stops.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Last-in-first-out register of the open modal dialogs.
 *
 * Only the topmost dialog reacts to Escape, so dismissing a confirmation
 * stacked over a form does not tear down both at once.
 */
export class DialogStack {
  private ids: string[] = [];

  push(id: string): void {
    this.remove(id);
    this.ids.push(id);
  }

  remove(id: string): void {
    const index = this.ids.indexOf(id);
    if (index !== -1) this.ids.splice(index, 1);
  }

  has(id: string): boolean {
    return this.ids.includes(id);
  }

  isTopmost(id: string): boolean {
    return this.ids.length > 0 && this.ids[this.ids.length - 1] === id;
  }

  get size(): number {
    return this.ids.length;
  }

  /** Test seam — resets the module-level stack between cases. */
  clear(): void {
    this.ids = [];
  }
}

/** The stack shared by every mounted `Dialog`. */
export const dialogStack = new DialogStack();

/**
 * Should this key press close the dialog?
 *
 * Non-dismissible dialogs — a settlement mid-signature, for example — ignore
 * Escape so a stray key cannot abandon an in-flight transaction.
 */
export function shouldCloseOnEscape(args: {
  key: string;
  dismissible: boolean;
  isTopmost: boolean;
}): boolean {
  return args.key === "Escape" && args.dismissible && args.isTopmost;
}

export interface FocusCandidate {
  /** Carries an explicit `data-autofocus` marker. */
  autofocus?: boolean;
  /** Lives in the dialog body rather than the title bar. */
  inBody?: boolean;
}

/**
 * Index of the control that should receive focus when a dialog opens.
 *
 * Preference order: an explicitly marked control, then the first control in
 * the body (the first form field, rather than the close button), then anything
 * focusable at all. Returns -1 when the dialog has no focusable content, in
 * which case the caller focuses the panel itself so focus still enters the
 * dialog.
 */
export function pickInitialFocusIndex(candidates: FocusCandidate[]): number {
  if (candidates.length === 0) return -1;

  const explicit = candidates.findIndex((c) => c.autofocus);
  if (explicit !== -1) return explicit;

  const firstInBody = candidates.findIndex((c) => c.inBody);
  if (firstInBody !== -1) return firstInBody;

  return 0;
}

/**
 * Where Tab should move focus to keep it inside the dialog.
 *
 * @param count        number of focusable controls in the dialog
 * @param currentIndex index of the focused control, or -1 if focus escaped
 * @param shiftKey     true for Shift+Tab
 *
 * @returns the index to focus, or `null` to let the browser handle the move.
 */
export function nextFocusIndex(
  count: number,
  currentIndex: number,
  shiftKey: boolean
): number | null {
  if (count === 0) return null;
  // Focus is outside the dialog (or on the panel itself) — pull it back in.
  if (currentIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey) return currentIndex === 0 ? count - 1 : null;
  return currentIndex === count - 1 ? 0 : null;
}
