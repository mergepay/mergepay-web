import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

/**
 * Stellar issued assets use 1–12 ASCII alphanumeric characters and a
 * checksummed ed25519 G-address as the issuer. XLM is native, not issued.
 */
export const TrustlineAssetSchema = z.object({
  assetCode: z
    .string()
    .min(1, "Asset code is required")
    .max(12, "Asset code must be 12 characters or fewer")
    .regex(/^[A-Za-z0-9]+$/, "Asset code must contain only letters and numbers")
    .refine((code) => code.toUpperCase() !== "XLM", {
      message: "XLM is a native asset and does not need a trustline",
    }),
  assetIssuer: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, "Issuer must be a 56-character Stellar G-address")
    .refine((issuer) => StrKey.isValidEd25519PublicKey(issuer), {
      message: "Issuer must be a valid Stellar public key",
    }),
});

export type TrustlineAssetValues = z.infer<typeof TrustlineAssetSchema>;
