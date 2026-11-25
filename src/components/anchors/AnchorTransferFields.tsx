"use client";

/**
 * Prefill fields shared by the SEP-24 deposit / withdrawal modals (#490).
 *
 * Amount, destination account and memo are optional — the anchor's hosted
 * page collects whatever is missing — but whatever the user types is
 * validated by `src/lib/validations/anchor.ts` and rendered inline, in the
 * neobrutalist field styling the rest of the app uses (`Label` / `Input` /
 * `FormError`).
 *
 * The component is controlled: the owning modal keeps the values and the
 * field errors, so it can gate the submit button on the same schema that
 * guards the API payload.
 */

import { Input, Label, FieldHint, FormError } from "@/components/ui/input";
import { isBlockedDecimalKey, isTypableAmount } from "@/lib/expenseValidation";
import type { AnchorSessionKind } from "@/lib/types";
import type { AnchorTransferFieldErrors } from "@/lib/validations/anchor";

export interface AnchorTransferValues {
  amount: string;
  destination: string;
  memo: string;
}

/** Fresh, blank form state — used when a modal opens or resets. */
export const EMPTY_ANCHOR_TRANSFER_VALUES: AnchorTransferValues = {
  amount: "",
  destination: "",
  memo: "",
};

export interface AnchorTransferFieldsProps {
  /** Direction of the flow, only used to phrase the hints. */
  kind: AnchorSessionKind;
  /** Asset the transfer is denominated in, shown next to the amount label. */
  assetCode: string;
  values: AnchorTransferValues;
  /** Per-field messages from `anchorTransferFieldErrors`. */
  errors: AnchorTransferFieldErrors;
  onChange: (next: AnchorTransferValues) => void;
  /** Unique prefix so several dialogs on one page never share ids. */
  idPrefix?: string;
}

function FieldMessage({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string;
  hint: string;
}) {
  if (error) {
    return (
      <div id={`${id}-error`} role="alert">
        <FormError>{error}</FormError>
      </div>
    );
  }
  return (
    <div id={`${id}-hint`}>
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}

export function AnchorTransferFields({
  kind,
  assetCode,
  values,
  errors,
  onChange,
  idPrefix = "anchor-transfer",
}: AnchorTransferFieldsProps) {
  const amountId = `${idPrefix}-amount`;
  const destinationId = `${idPrefix}-destination`;
  const memoId = `${idPrefix}-memo`;

  function update(field: keyof AnchorTransferValues, value: string) {
    onChange({ ...values, [field]: value });
  }

  return (
    <div className="space-y-3">
      <p className="font-display text-xs uppercase tracking-widest text-ink/60">
        Transfer details
      </p>

      <div>
        <Label htmlFor={amountId}>Amount ({assetCode})</Label>
        <Input
          id={amountId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="e.g. 25.00"
          value={values.amount}
          onChange={(event) => {
            // Refuse the keystroke rather than the submission: the anchor
            // rejects anything outside Stellar's 7-decimal precision, and a
            // character that never lands cannot be mistyped.
            if (isTypableAmount(event.target.value)) {
              update("amount", event.target.value);
            }
          }}
          onKeyDown={(event) => {
            if (isBlockedDecimalKey(event.key)) event.preventDefault();
          }}
          className={errors.amount ? "border-flamingo" : undefined}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={
            errors.amount ? `${amountId}-error` : `${amountId}-hint`
          }
        />
        <FieldMessage
          id={amountId}
          error={errors.amount}
          hint="Optional. Prefills the anchor's transfer page."
        />
      </div>

      <div>
        <Label htmlFor={destinationId}>Destination account</Label>
        <Input
          id={destinationId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="G… 56-character Stellar public key"
          className="font-mono text-sm"
          value={values.destination}
          onChange={(event) => update("destination", event.target.value)}
          aria-invalid={errors.destination ? true : undefined}
          aria-describedby={
            errors.destination
              ? `${destinationId}-error`
              : `${destinationId}-hint`
          }
        />
        <FieldMessage
          id={destinationId}
          error={errors.destination}
          hint={
            kind === "deposit"
              ? "Optional. The Stellar account the anchor should fund — defaults to your wallet."
              : "Optional. The Stellar account the payout should reach — defaults to your wallet."
          }
        />
      </div>

      <div>
        <Label htmlFor={memoId}>Memo</Label>
        <Input
          id={memoId}
          type="text"
          autoComplete="off"
          placeholder="e.g. rent-september"
          className="font-mono text-sm"
          value={values.memo}
          onChange={(event) => update("memo", event.target.value)}
          aria-invalid={errors.memo ? true : undefined}
          aria-describedby={errors.memo ? `${memoId}-error` : `${memoId}-hint`}
        />
        <FieldMessage
          id={memoId}
          error={errors.memo}
          hint="Optional. Attached to the on-chain payment, up to 28 bytes."
        />
      </div>
    </div>
  );
}
