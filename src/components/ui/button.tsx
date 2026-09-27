import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "danger"
  | "ghost"
  | "lime"
  | "tangerine";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-display uppercase tracking-wide border-3 border-ink transition-all duration-100 select-none " +
  "shadow-brutal hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg " +
  "active:translate-x-1 active:translate-y-1 active:shadow-none " +
  "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40";

const variants: Record<Variant, string> = {
  primary: "bg-grape text-white",
  secondary: "bg-ink text-lime",
  outline: "bg-cream text-ink",
  danger: "bg-flamingo text-ink",
  ghost:
    "bg-transparent border-transparent shadow-none hover:shadow-none hover:bg-ink/5 hover:translate-x-0 hover:translate-y-0 text-ink normal-case font-body font-bold",
  lime: "bg-lime text-ink",
  tangerine: "bg-tangerine text-ink",
};

const sizes: Record<Size, string> = {
  sm: "text-xs px-3 py-2 min-h-[44px] rounded-lg",
  md: "text-sm px-5 py-2.5 min-h-[44px] rounded-xl",
  lg: "text-base px-7 py-3.5 min-h-[44px] rounded-xl",
  icon: "h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl",
};

/**
 * The class list for a given variant/size without rendering a `<button>`.
 * Lets an anchor (e.g. the ErrorBoundary "Return to Dashboard" escape hatch)
 * look identical to a Button while remaining a real navigation link.
 */
export function buttonClassName(variant: Variant = "primary", size: Size = "md") {
  return cn(base, variants[variant], sizes[size]);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      children,
      disabled,
      // Default to "button" rather than the HTML default of "submit", so a
      // Cancel or Close control inside a dialog form cannot submit it when
      // activated with Enter or Space. Submit buttons opt in explicitly.
      type = "button",
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
