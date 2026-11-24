"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  type InputHTMLAttributes,
} from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  STELLAR_PUBLIC_KEY_LENGTH,
  normalizeStellarAddress,
  validateStellarAddress,
  type StellarAddressValidation,
} from "@/lib/validators/stellarAddress";

export interface StellarAddressInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "defaultValue"
  > {
  /** Controlled value (the normalised address). */
  value: string;
  /** Receives the normalised value (no whitespace, uppercase) on every edit. */
  onChange: (value: string) => void;
  /** Called whenever the validation result changes. */
  onValidationChange?: (validation: StellarAddressValidation) => void;
  /** Optional visible label rendered above the field. */
  label?: string;
  /** Extra helper copy shown while the field is empty or incomplete. */
  hint?: string;
}

/**
 * Text input for a Stellar ed25519 public key (G-address) with live
 * validation (#893).
 *
 * - Whitespace is stripped and letters are uppercased as the user types, so
 *   addresses pasted from chat apps with line breaks still validate.
 * - Mobile keyboards are told not to autocorrect, autocapitalise words or
 *   spell-check, and to offer an uppercase layout.
 * - The neobrutalist border and helper text change colour with the state:
 *   neutral while incomplete, lime when valid, flamingo when wrong.
 * - Checksum verification uses `StrKey` from `@stellar/stellar-sdk`, and only
 *   runs once the input is a complete 56-character G-string.
 */
export const StellarAddressInput = forwardRef<
  HTMLInputElement,
  StellarAddressInputProps
>(function StellarAddressInput(
  {
    value,
    onChange,
    onValidationChange,
    label,
    hint,
    id,
    className,
    placeholder = "G… 56-character Stellar public key",
    "aria-describedby": describedBy,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? `stellar-address-${generatedId}`;
  const helperId = `${inputId}-helper`;

  const validation = useMemo(() => validateStellarAddress(value), [value]);

  // Notify on status changes only, not on every render.
  const notify = useRef(onValidationChange);
  notify.current = onValidationChange;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${validation.status}:${validation.normalized}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    notify.current?.(validation);
  }, [validation]);

  const tone = validation.isValid
    ? "valid"
    : validation.isError
      ? "error"
      : "neutral";

  const helperText =
    tone === "neutral" && hint && validation.status === "empty"
      ? hint
      : validation.message;

  const Icon =
    tone === "valid" ? CheckCircle2 : tone === "error" ? AlertTriangle : Info;

  return (
    <div>
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <Input
        ref={ref}
        id={inputId}
        type="text"
        value={value}
        onChange={(event) => onChange(normalizeStellarAddress(event.target.value))}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="done"
        // A little headroom over 56 so a slightly-too-long paste is shown
        // and explained instead of being silently truncated.
        maxLength={STELLAR_PUBLIC_KEY_LENGTH + 8}
        placeholder={placeholder}
        aria-invalid={validation.isError ? true : undefined}
        aria-describedby={[helperId, describedBy].filter(Boolean).join(" ")}
        data-validation={validation.status}
        className={cn(
          "font-mono text-sm tracking-tight",
          tone === "valid" && "border-lime-dark shadow-brutal-lime focus:shadow-brutal-lime",
          tone === "error" && "border-flamingo bg-flamingo-pale/40",
          className
        )}
        {...props}
      />
      <p
        id={helperId}
        role={validation.isError ? "alert" : undefined}
        aria-live="polite"
        className={cn(
          "mt-1 flex items-start gap-1 font-body text-xs",
          tone === "valid" && "font-bold text-ink",
          tone === "error" && "font-bold text-flamingo",
          tone === "neutral" && "text-ink/60"
        )}
      >
        <Icon
          className={cn(
            "mt-px h-3.5 w-3.5 shrink-0",
            tone === "valid" && "text-lime-dark"
          )}
          aria-hidden="true"
        />
        <span>
          {helperText}
          {validation.status === "incomplete" && (
            <span className="ml-1 font-mono">
              ({validation.normalized.length}/{STELLAR_PUBLIC_KEY_LENGTH})
            </span>
          )}
        </span>
      </p>
    </div>
  );
});

export default StellarAddressInput;
