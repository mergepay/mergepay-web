"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import {
  TrustlineAssetSchema,
  type TrustlineAssetValues,
} from "@/lib/trustline-schema";

export interface TrustlineFormProps {
  /** Called only with validated issued-asset details. Signing is handled by the caller. */
  onSubmit: (asset: TrustlineAssetValues) => void | Promise<void>;
  disabled?: boolean;
}

export function TrustlineForm({ onSubmit, disabled = false }: TrustlineFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TrustlineAssetValues>({
    resolver: zodResolver(TrustlineAssetSchema),
    mode: "onBlur",
    defaultValues: { assetCode: "", assetIssuer: "" },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      aria-label="Custom asset trustline configuration"
    >
      <div>
        <Label htmlFor="trustline-asset-code">Asset code</Label>
        <Input
          id="trustline-asset-code"
          placeholder="USDC"
          maxLength={12}
          autoComplete="off"
          aria-invalid={Boolean(errors.assetCode)}
          aria-describedby={errors.assetCode ? "trustline-asset-code-error" : "trustline-asset-code-hint"}
          disabled={disabled || isSubmitting}
          {...register("assetCode")}
        />
        <FieldHint>1–12 letters or numbers; XLM does not require a trustline.</FieldHint>
        <span id="trustline-asset-code-hint" className="sr-only">
          Enter 1 to 12 letters or numbers.
        </span>
        <FieldError id="trustline-asset-code-error">{errors.assetCode?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="trustline-asset-issuer">Issuer public key</Label>
        <Input
          id="trustline-asset-issuer"
          placeholder="G..."
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.assetIssuer)}
          aria-describedby={errors.assetIssuer ? "trustline-asset-issuer-error" : "trustline-asset-issuer-hint"}
          disabled={disabled || isSubmitting}
          {...register("assetIssuer")}
        />
        <span id="trustline-asset-issuer-hint" className="sr-only">
          Enter the issuing account's 56-character Stellar G-address.
        </span>
        <FieldError id="trustline-asset-issuer-error">{errors.assetIssuer?.message}</FieldError>
      </div>
      <Button type="submit" loading={isSubmitting} disabled={disabled || isSubmitting}>
        Continue with asset
      </Button>
    </form>
  );
}
