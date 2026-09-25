/**
 * Clipboard helpers.
 *
 * `navigator.clipboard` is unavailable in a few real situations: an
 * insecure (non-HTTPS) origin, a browser that predates the async
 * clipboard API, or an embedding document whose permissions policy
 * blocks `clipboard-write`. Rather than silently failing, callers get a
 * boolean and can fall back to a manual select-and-copy affordance.
 *
 * The legacy `document.execCommand("copy")` path is a last resort only —
 * it is deprecated, but it is still the only mechanism available on the
 * browsers that lack `navigator.clipboard`.
 */

/** Copy `text`, resolving to whether the clipboard actually received it. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or not focused — try the legacy path below.
    }
  }
  return legacyCopy(text);
}

/**
 * Fallback copy using a temporary, visually hidden textarea and the
 * deprecated `execCommand("copy")`. Returns `false` — never throws —
 * when even that is unavailable, so callers can tell the user to copy
 * the value manually.
 */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Keep the element out of the layout *and* off-screen, so triggering
  // focus does not scroll the page to the bottom.
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  const selection = document.getSelection();
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0) : null;

  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    if (typeof document.execCommand !== "function") return false;
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    // Restore whatever the user had selected before we hijacked it.
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}
