import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const fieldBase =
  "w-full bg-white border-3 border-ink rounded-xl px-4 py-2.5 font-body text-ink placeholder:text-ink/40 " +
  "shadow-brutal-sm focus:shadow-brutal focus:-translate-x-px focus:-translate-y-px " +
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/40 " +
  "transition-all duration-100 disabled:opacity-50 disabled:bg-paper";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, className)} {...props} />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[90px]", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, "appearance-none cursor-pointer", className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block font-display text-xs uppercase tracking-widest mb-1.5 text-ink",
        className
      )}
      {...props}
    />
  );
}

/**
 * Inline validation message for a form field. Pair the `id` with the field's
 * `aria-describedby` (and set `aria-invalid` on the field) so the message is
 * announced with it; `role="alert"` announces it when it first appears.
 * Renders nothing when there is no message.
 */
export function FieldError({
  id,
  badge,
  children,
}: {
  id?: string;
  /**
   * Optional short label rendered as a flamingo neobrutalist `Badge` in
   * front of the message (e.g. "Split"), to make the error scannable.
   */
  badge?: string;
  children?: React.ReactNode;
}) {
  if (!children) return null;
  if (badge) {
    return (
      <p
        id={id}
        role="alert"
        className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold text-flamingo-dark font-body"
      >
        <Badge tone="flamingo" aria-hidden="true">{badge}</Badge>
        <span>{children}</span>
      </p>
    );
  }
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-bold text-flamingo-dark font-body">
      {children}
    </p>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-ink/60 font-body">{children}</p>;
}

export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-flamingo font-bold">{children}</p>;
}
