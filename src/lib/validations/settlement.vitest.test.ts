import { describe, expect, it } from "vitest";

import {
  createSettlementFormSchema,
  settlementAmountSchema,
  settlementAssetCodeSchema,
  settlementConfirmPayloadSchema,
  settlementDestinationSchema,
  settlementPayloadSchema,
  settlementRecipientSchema,
} from "./settlement";

/** Valid key from the existing fixtures (a real checksum-valid G-address). */
const VALID_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
/** Same length and alphabet, last character broken: checksum fails. */
const BAD_CHECKSUM_KEY = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVX";

function firstMessage(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}): string {
  return result.error?.issues[0]?.message ?? "";
}

const VALID_PAYLOAD = {
  toUserId: "user-2",
  amount: "42.5",
  assetCode: "XLM",
  assetIssuer: null,
};

describe("settlementAmountSchema", () => {
  it("accepts a positive amount with up to 7 decimal places", () => {
    expect(settlementAmountSchema.safeParse("42.5000000").success).toBe(true);
    expect(settlementAmountSchema.safeParse("0.0000001").success).toBe(true);
  });

  it("rejects a missing amount", () => {
    expect(firstMessage(settlementAmountSchema.safeParse(""))).toBe(
      "Amount is required"
    );
  });

  it("rejects negative amounts", () => {
    expect(firstMessage(settlementAmountSchema.safeParse("-5"))).toMatch(
      /positive decimal/
    );
  });

  it("rejects zero", () => {
    expect(firstMessage(settlementAmountSchema.safeParse("0"))).toBe(
      "Amount must be greater than zero"
    );
  });

  it("rejects more than 7 decimal places", () => {
    expect(firstMessage(settlementAmountSchema.safeParse("1.12345678"))).toMatch(
      /at most 7 decimal place/
    );
  });

  it("rejects exponent notation and float drift", () => {
    expect(firstMessage(settlementAmountSchema.safeParse("1e5"))).toMatch(
      /positive decimal/
    );
    expect(firstMessage(settlementAmountSchema.safeParse("0.1 + 0.2"))).toMatch(
      /positive decimal/
    );
  });
});

describe("settlementRecipientSchema", () => {
  it("accepts a group member id", () => {
    expect(settlementRecipientSchema.safeParse("user-2").success).toBe(true);
  });

  it("accepts a valid Stellar public key", () => {
    expect(settlementRecipientSchema.safeParse(VALID_KEY).success).toBe(true);
  });

  it("requires a recipient", () => {
    expect(firstMessage(settlementRecipientSchema.safeParse(""))).toBe(
      "Choose who to pay"
    );
  });

  it("rejects a malformed G-address instead of forwarding it", () => {
    expect(
      firstMessage(settlementRecipientSchema.safeParse(BAD_CHECKSUM_KEY))
    ).toMatch(/valid 56-character Stellar public key/);
  });

  it("rejects a truncated key", () => {
    expect(settlementRecipientSchema.safeParse("GA5ZSEJYB37JRC5").success).toBe(
      false
    );
    expect(settlementRecipientSchema.safeParse("G").success).toBe(false);
  });
});

describe("settlementDestinationSchema", () => {
  it("requires a real Stellar account", () => {
    expect(settlementDestinationSchema.safeParse(VALID_KEY).success).toBe(true);
    expect(settlementDestinationSchema.safeParse("user-2").success).toBe(false);
    expect(settlementDestinationSchema.safeParse(BAD_CHECKSUM_KEY).success).toBe(
      false
    );
  });
});

describe("settlementAssetCodeSchema", () => {
  it("accepts XLM and USDC", () => {
    expect(settlementAssetCodeSchema.safeParse("XLM").success).toBe(true);
    expect(settlementAssetCodeSchema.safeParse("USDC").success).toBe(true);
  });

  it("requires an asset code", () => {
    expect(firstMessage(settlementAssetCodeSchema.safeParse(""))).toBe(
      "Asset code is required"
    );
  });

  it("rejects codes that cannot exist on Stellar", () => {
    expect(
      settlementAssetCodeSchema.safeParse("THIS-IS-NOT-AN-ASSET").success
    ).toBe(false);
  });
});

describe("settlementPayloadSchema", () => {
  it("accepts a valid native-asset settlement", () => {
    expect(settlementPayloadSchema.safeParse(VALID_PAYLOAD).success).toBe(true);
  });

  it("accepts a valid issued-asset settlement and normalises a blank issuer", () => {
    const parsed = settlementPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      assetCode: "USDC",
      assetIssuer: "",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.assetIssuer).toBeNull();
  });

  it("rejects a malformed issuer", () => {
    expect(
      settlementPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        assetCode: "USDC",
        assetIssuer: "GNOTAKEY",
      }).success
    ).toBe(false);
  });

  it("rejects a malformed memo", () => {
    expect(
      settlementPayloadSchema.safeParse({ ...VALID_PAYLOAD, memo: "not-a-memo" })
        .success
    ).toBe(false);
  });

  it("accepts a well-formed Mergepay memo", () => {
    expect(
      settlementPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        memo: "MP:abc123",
      }).success
    ).toBe(true);
  });

  it("exposes the dialog's existing schema under its historical name", () => {
    expect(createSettlementFormSchema).toBe(settlementPayloadSchema);
  });
});

describe("settlementConfirmPayloadSchema", () => {
  it("accepts base64 XDR", () => {
    expect(
      settlementConfirmPayloadSchema.safeParse({
        signedXdr: "AAAAAgAAAAB+base64/xdr==",
      }).success
    ).toBe(true);
  });

  it("requires the signed transaction", () => {
    expect(
      firstMessage(settlementConfirmPayloadSchema.safeParse({ signedXdr: "" }))
    ).toBe("Signed transaction is required");
  });

  it("rejects a value that is not base64", () => {
    expect(
      firstMessage(
        settlementConfirmPayloadSchema.safeParse({ signedXdr: "not base64!" })
      )
    ).toBe("Signed transaction must be base64-encoded XDR");
  });
});
