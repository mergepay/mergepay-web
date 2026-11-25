import { describe, expect, it } from "vitest";

import {
  anchorAmountSchema,
  anchorDestinationSchema,
  anchorMemoSchema,
  anchorTransferFieldErrors,
  anchorTransferSchema,
  buildAnchorTransferPayload,
  requiredAnchorAmountSchema,
  requiredAnchorDestinationSchema,
  requiredAnchorMemoSchema,
  STELLAR_MEMO_MAX_BYTES,
  type AnchorTransferFormInput,
} from "./anchor";

/** Real USDC issuer — a checksum-valid ed25519 public key. */
const VALID_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

/** Same key with one character swapped — fails the CRC16 checksum. */
const BAD_CHECKSUM_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVZ";

/** First issue message of any `safeParse` result, or "" when it succeeded. */
function message(result: {
  success: boolean;
  error?: { issues?: { message?: string }[] } | undefined;
}): string {
  if (result.success) return "";
  return result.error?.issues?.[0]?.message ?? "";
}

function validForm(
  overrides: Partial<AnchorTransferFormInput> = {}
): AnchorTransferFormInput {
  return {
    kind: "deposit",
    assetCode: "XLM",
    anchorName: "TestAnchor",
    amount: "",
    destination: "",
    memo: "",
    ...overrides,
  };
}

describe("anchorAmountSchema", () => {
  it("accepts a blank amount (the anchor collects it later)", () => {
    expect(anchorAmountSchema.safeParse("").success).toBe(true);
    expect(anchorAmountSchema.safeParse("   ").success).toBe(true);
  });

  it("accepts plain positive decimals within Stellar precision", () => {
    for (const amount of ["1", "25", "0.5", "0.0000001", "123456789.1234567"]) {
      expect(anchorAmountSchema.safeParse(amount).success).toBe(true);
    }
  });

  it("trims surrounding whitespace before validating", () => {
    const result = anchorAmountSchema.safeParse("  12.5  ");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("12.5");
  });

  it("rejects non-numeric input", () => {
    const result = anchorAmountSchema.safeParse("12.5.5");
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/positive decimal/i);
  });

  it("rejects signed, exponential and grouped numbers", () => {
    for (const amount of ["-5", "+5", "1e5", "1,000", "0x10"]) {
      const result = anchorAmountSchema.safeParse(amount);
      expect(result.success).toBe(false);
      expect(message(result)).toMatch(/positive decimal/i);
    }
  });

  it("rejects zero", () => {
    const result = anchorAmountSchema.safeParse("0");
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/greater than zero/i);
  });

  it("rejects more than 7 decimal places", () => {
    const result = anchorAmountSchema.safeParse("0.00000001");
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/at most 7 decimal/i);
  });

  it("rejects a bare decimal point", () => {
    expect(anchorAmountSchema.safeParse(".").success).toBe(false);
  });
});

describe("requiredAnchorAmountSchema", () => {
  it("rejects a blank amount", () => {
    const result = requiredAnchorAmountSchema.safeParse("");
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/required/i);
  });

  it("accepts a filled amount", () => {
    expect(requiredAnchorAmountSchema.safeParse("10").success).toBe(true);
  });
});

describe("anchorDestinationSchema", () => {
  it("accepts a blank destination (defaults to the wallet)", () => {
    expect(anchorDestinationSchema.safeParse("").success).toBe(true);
    expect(anchorDestinationSchema.safeParse("  ").success).toBe(true);
  });

  it("accepts a checksum-valid Stellar public key", () => {
    const result = anchorDestinationSchema.safeParse(`  ${VALID_KEY}  `);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe(VALID_KEY);
  });

  it("rejects a key with a broken checksum", () => {
    const result = anchorDestinationSchema.safeParse(BAD_CHECKSUM_KEY);
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/Stellar public key/i);
  });

  it("rejects truncated keys, mixed case and arbitrary text", () => {
    for (const destination of ["GSHORT", VALID_KEY.toLowerCase(), "my-bank-account", "G" + "A".repeat(55)]) {
      const result = anchorDestinationSchema.safeParse(destination);
      expect(result.success).toBe(false);
      expect(message(result)).toMatch(/Stellar public key/i);
    }
  });
});

describe("requiredAnchorDestinationSchema", () => {
  it("rejects a blank destination", () => {
    const result = requiredAnchorDestinationSchema.safeParse("");
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/required/i);
  });

  it("accepts a valid key", () => {
    expect(requiredAnchorDestinationSchema.safeParse(VALID_KEY).success).toBe(true);
  });
});

describe("anchorMemoSchema", () => {
  it("accepts a blank memo", () => {
    expect(anchorMemoSchema.safeParse("").success).toBe(true);
    expect(anchorMemoSchema.safeParse("   ").success).toBe(true);
  });

  it("accepts a short single-line memo", () => {
    expect(anchorMemoSchema.safeParse("rent-september").success).toBe(true);
  });

  it("accepts a memo exactly at the Stellar byte limit", () => {
    expect(anchorMemoSchema.safeParse("a".repeat(STELLAR_MEMO_MAX_BYTES)).success).toBe(true);
  });

  it("rejects a memo one byte over the Stellar limit", () => {
    const result = anchorMemoSchema.safeParse("a".repeat(STELLAR_MEMO_MAX_BYTES + 1));
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/28 bytes/);
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 14 × 2-byte characters = 28 bytes: valid. 15 × 2 = 30 bytes: rejected.
    expect(anchorMemoSchema.safeParse("é".repeat(14)).success).toBe(true);
    const over = anchorMemoSchema.safeParse("é".repeat(15));
    expect(over.success).toBe(false);
    expect(message(over)).toMatch(/28 bytes/);
  });

  it("rejects multi-line memos", () => {
    const result = anchorMemoSchema.safeParse("rent\nseptember");
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/single line/i);
  });

  it("rejects control characters", () => {
    const result = anchorMemoSchema.safeParse("rent\x00september");
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/control characters/i);
  });
});

describe("requiredAnchorMemoSchema", () => {
  it("rejects a blank memo but keeps the other rules", () => {
    expect(requiredAnchorMemoSchema.safeParse("").success).toBe(false);
    expect(requiredAnchorMemoSchema.safeParse("ok").success).toBe(true);
    expect(
      requiredAnchorMemoSchema.safeParse("a".repeat(STELLAR_MEMO_MAX_BYTES + 1)).success
    ).toBe(false);
  });
});

describe("anchorTransferSchema", () => {
  it("accepts a fully blank prefill once an anchor is chosen", () => {
    expect(anchorTransferSchema.safeParse(validForm()).success).toBe(true);
  });

  it("accepts a fully specified transfer", () => {
    expect(
      anchorTransferSchema.safeParse(
        validForm({
          kind: "withdrawal",
          assetCode: "USDC",
          amount: "25.5",
          destination: VALID_KEY,
          memo: "payout-01",
        })
      ).success
    ).toBe(true);
  });

  it("requires an anchor", () => {
    const result = anchorTransferSchema.safeParse(validForm({ anchorName: "" }));
    expect(result.success).toBe(false);
    expect(message(result)).toMatch(/anchor/i);
  });

  it("rejects an unknown direction", () => {
    const result = anchorTransferSchema.safeParse(
      validForm({ kind: "swap" as "deposit" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects malformed asset codes", () => {
    for (const assetCode of ["", "X L M", "TOOLONGASSETCODE"]) {
      expect(anchorTransferSchema.safeParse(validForm({ assetCode })).success).toBe(false);
    }
  });
});

describe("anchorTransferFieldErrors", () => {
  it("returns no errors for a valid form", () => {
    expect(anchorTransferFieldErrors(validForm())).toEqual({});
  });

  it("reports every failing field at once", () => {
    const errors = anchorTransferFieldErrors(
      validForm({ amount: "1e5", destination: "nope", memo: "a".repeat(29) })
    );
    expect(errors.amount).toMatch(/positive decimal/i);
    expect(errors.destination).toMatch(/Stellar public key/i);
    expect(errors.memo).toMatch(/28 bytes/);
    expect(errors.assetCode).toBeUndefined();
    expect(errors.anchorName).toBeUndefined();
  });

  it("only reports the first issue per field", () => {
    const errors = anchorTransferFieldErrors(validForm({ amount: "-1", memo: "a".repeat(40) }));
    expect(typeof errors.amount).toBe("string");
    expect(typeof errors.memo).toBe("string");
  });

  it("flags a missing anchor separately from the prefill fields", () => {
    const errors = anchorTransferFieldErrors(validForm({ anchorName: "" }));
    expect(errors.anchorName).toMatch(/anchor/i);
    expect(errors.amount).toBeUndefined();
  });
});

describe("buildAnchorTransferPayload", () => {
  it("keeps the historical shape when nothing is prefilled", () => {
    expect(
      buildAnchorTransferPayload({
        assetCode: "XLM",
        anchorName: "TestAnchor",
        amount: "",
        destination: "",
        memo: "",
      })
    ).toEqual({ assetCode: "XLM", anchorName: "TestAnchor" });
  });

  it("trims and includes only the filled-in fields", () => {
    const payload = buildAnchorTransferPayload({
      assetCode: "USDC",
      anchorName: "TestAnchor",
      amount: "  12.5  ",
      destination: `  ${VALID_KEY} `,
      memo: "",
    });

    expect(payload).toEqual({
      assetCode: "USDC",
      anchorName: "TestAnchor",
      amount: "12.5",
      destination: VALID_KEY,
    });
    expect("memo" in payload).toBe(false);
  });
});
