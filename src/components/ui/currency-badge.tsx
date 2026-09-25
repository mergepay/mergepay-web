import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SettlementAssetCode } from "@/lib/types";

/**
 * Neobrutalist asset tag for the settlement assets Mergepay supports.
 *
 * Renders a compact, high-contrast badge that makes it obvious at a glance
 * which asset an amount is denominated in: XLM (the native asset) gets the
 * inverted ink-on-lime treatment, while USDC (the issued stablecoin) gets a
 * solid aqua plate. Any other code falls back to the neutral paper style so
 * unknown assets never masquerade as a settlement asset.
 *
 * Built on the shared `Badge` primitive (`src/components/ui/badge.tsx`) so
 * the border, radius, typography and hard shadow stay consistent with the
 * rest of the design system.
 *
 * @example
 *   <CurrencyBadge code="XLM" />   // ink badge with lime text
 *   <CurrencyBadge code="USDC" />  // aqua badge with ink text
 *   <CurrencyBadge code={expense.assetCode} />
 */
export function CurrencyBadge({
  code,
  className,
}: {
  /** Asset code to display, e.g. "XLM", "USDC". Normalised to upper-case. */
  code: string | null | undefined;
  className?: string;
}) {
  const normalized = (code ?? "").trim().toUpperCase();

  const isXLM = normalized === "XLM";
  const isUSDC = normalized === "USDC";

  const tone = isXLM ? "ink" : isUSDC ? "aqua" : "paper";

  return (
    <Badge tone={tone} className={className}>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" />
      </svg>
      {normalized || "—"}
      <span className="sr-only">
        {isXLM || isUSDC
          ? `${normalized} asset`
          : normalized
            ? `${normalized} asset (not a standard settlement asset)`
            : "Unknown asset"}
      </span>
    </Badge>
  );
}

/**
 * Helper for callers that already hold a `SettlementAssetCode` and want the
 * badge's tone without rendering the component (e.g. legend swatches).
 */
export function currencyBadgeTone(code: SettlementAssetCode | string) {
  const normalized = code.trim().toUpperCase();
  if (normalized === "XLM") return "ink" as const;
  if (normalized === "USDC") return "aqua" as const;
  return "paper" as const;
}
