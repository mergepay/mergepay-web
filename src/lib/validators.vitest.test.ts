import { describe, expect, it } from "vitest";
import {
  createGroupFormSchema,
  createSettlementFormSchema,
  enableTreasuryFormSchema,
  treasuryDepositFormSchema,
  treasuryWithdrawFormSchema,
  participantSplitSchema,
  fieldErrorsFrom,
} from "./validators";

/** Real USDC issuer on Stellar mainnet/testnet — a valid ed25519 public key. */
const VALID_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
/** Second valid key, used for destinations (from the e2e member fixtures). */
const VALID_DESTINATION = "GBLI7JERBEGKK3DLZNR7B2TNGDNNUMX5X5R5JCS3TODZNCKJA7W6KG7M";

function firstMessage(result: { success: boolean; error?: { issues: { message: string; path: (string | number)[] }[] } }) {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

// ---------------------------------------------------------------------------
// createGroupFormSchema
// ---------------------------------------------------------------------------

describe("createGroupFormSchema", () => {
  it("accepts a well-formed group", () => {
    const result = createGroupFormSchema.safeParse({
      name: "Apartment 4B",
      description: "Rent and utilities",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a missing description", () => {
    const result = createGroupFormSchema.safeParse({ name: "Trip" });
    expect(result.success).toBe(true);
  });

  it("requires a name", () => {
    expect(firstMessage(createGroupFormSchema.safeParse({ name: "" }))).toBe(
      "Group name must be at least 2 characters"
    );
  });

  it("rejects a whitespace-only name", () => {
    expect(firstMessage(createGroupFormSchema.safeParse({ name: "   " }))).toBe(
      "Group name must be at least 2 characters"
    );
  });

  it("rejects a one-character name", () => {
    expect(firstMessage(createGroupFormSchema.safeParse({ name: "A" }))).toBe(
      "Group name must be at least 2 characters"
    );
  });

  it("rejects a name over 60 characters", () => {
    expect(
      firstMessage(createGroupFormSchema.safeParse({ name: "A".repeat(61) }))
    ).toBe("Group name cannot exceed 60 characters");
  });

  it("rejects a description over 280 characters", () => {
    expect(
      firstMessage(
        createGroupFormSchema.safeParse({
          name: "Trip",
          description: "A".repeat(281),
        })
      )
    ).toBe("Description cannot exceed 280 characters");
  });

  it("normalises a whitespace-only description to undefined", () => {
    const result = createGroupFormSchema.safeParse({
      name: "Trip",
      description: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeUndefined();
  });

  it("reports errors on the matching field path", () => {
    const result = createGroupFormSchema.safeParse({
      name: "",
      description: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["name"]);
    }
  });
});

// ---------------------------------------------------------------------------
// createSettlementFormSchema
// ---------------------------------------------------------------------------

describe("createSettlementFormSchema", () => {
  const valid = {
    toUserId: "user-2",
    amount: "42.5000000",
    assetCode: "XLM",
    assetIssuer: null,
  };

  it("accepts a valid native-asset settlement", () => {
    expect(createSettlementFormSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid issued-asset settlement", () => {
    expect(
      createSettlementFormSchema.safeParse({
        ...valid,
        assetCode: "USDC",
        assetIssuer: VALID_ISSUER,
      }).success
    ).toBe(true);
  });

  it("requires a recipient", () => {
    expect(
      firstMessage(createSettlementFormSchema.safeParse({ ...valid, toUserId: "" }))
    ).toBe("Choose who to pay");
  });

  it("requires an amount", () => {
    expect(
      firstMessage(createSettlementFormSchema.safeParse({ ...valid, amount: "" }))
    ).toBe("Amount is required");
  });

  it("rejects zero amounts", () => {
    expect(
      firstMessage(createSettlementFormSchema.safeParse({ ...valid, amount: "0" }))
    ).toBe("Amount must be greater than zero");
  });

  it("rejects negative amounts", () => {
    expect(
      firstMessage(
        createSettlementFormSchema.safeParse({ ...valid, amount: "-5" })
      )
    ).toMatch(/positive decimal/);
  });

  it("rejects more than 7 decimal places", () => {
    expect(
      firstMessage(
        createSettlementFormSchema.safeParse({ ...valid, amount: "1.12345678" })
      )
    ).toMatch(/at most 7 decimal place/);
  });

  it("rejects exponent notation", () => {
    expect(
      firstMessage(
        createSettlementFormSchema.safeParse({ ...valid, amount: "1e5" })
      )
    ).toMatch(/positive decimal/);
  });

  it("requires an asset code", () => {
    expect(
      firstMessage(
        createSettlementFormSchema.safeParse({ ...valid, assetCode: "" })
      )
    ).toBe("Asset code is required");
  });

  it("rejects a malformed issuer key", () => {
    expect(
      createSettlementFormSchema.safeParse({
        ...valid,
        assetCode: "USDC",
        assetIssuer: "GNOTAKEY",
      }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enableTreasuryFormSchema
// ---------------------------------------------------------------------------

describe("enableTreasuryFormSchema", () => {
  const valid = {
    publicKey: VALID_ISSUER,
    requiredSigners: 2,
  };

  it("accepts a valid configuration", () => {
    expect(enableTreasuryFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a malformed treasury public key", () => {
    const result = enableTreasuryFormSchema.safeParse({
      ...valid,
      publicKey: "GSHORT",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/valid 56-character Stellar public key/);
  });

  it("rejects a secret key pasted into the public key field", () => {
    expect(
      enableTreasuryFormSchema.safeParse({
        ...valid,
        publicKey: "S" + VALID_ISSUER.slice(1),
      }).success
    ).toBe(false);
  });

  it("rejects a zero signer threshold", () => {
    expect(
      firstMessage(
        enableTreasuryFormSchema.safeParse({ ...valid, requiredSigners: 0 })
      )
    ).toBe("At least one signer is required");
  });

  it("rejects a threshold above 20", () => {
    expect(
      firstMessage(
        enableTreasuryFormSchema.safeParse({ ...valid, requiredSigners: 21 })
      )
    ).toBe("At most 20 signers are supported");
  });

  it("rejects a fractional threshold", () => {
    expect(
      enableTreasuryFormSchema.safeParse({ ...valid, requiredSigners: 1.5 })
        .success
    ).toBe(false);
  });

  it("rejects a missing threshold", () => {
    expect(
      enableTreasuryFormSchema.safeParse({ publicKey: VALID_ISSUER }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// treasuryDepositFormSchema
// ---------------------------------------------------------------------------

describe("treasuryDepositFormSchema", () => {
  const valid = { amount: "25", assetCode: "XLM", assetIssuer: null };

  it("accepts a native deposit", () => {
    expect(treasuryDepositFormSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an issued deposit with a real issuer", () => {
    expect(
      treasuryDepositFormSchema.safeParse({
        ...valid,
        assetCode: "USDC",
        assetIssuer: VALID_ISSUER,
      }).success
    ).toBe(true);
  });

  it("requires an issuer for non-native assets", () => {
    const result = treasuryDepositFormSchema.safeParse({
      ...valid,
      assetCode: "USDC",
    });
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.some((i) => i.path[0] === "assetIssuer")).toBe(true);
  });

  it("rejects sub-stroop precision", () => {
    expect(
      firstMessage(
        treasuryDepositFormSchema.safeParse({ ...valid, amount: "0.00000001" })
      )
    ).toMatch(/at most 7 decimal place/);
  });

  it("rejects zero amounts", () => {
    expect(
      firstMessage(
        treasuryDepositFormSchema.safeParse({ ...valid, amount: "0" })
      )
    ).toBe("Amount must be greater than zero");
  });
});

// ---------------------------------------------------------------------------
// treasuryWithdrawFormSchema
// ---------------------------------------------------------------------------

describe("treasuryWithdrawFormSchema", () => {
  const valid = {
    amount: "10",
    assetCode: "XLM",
    assetIssuer: null,
    destination: VALID_DESTINATION,
  };

  it("accepts a valid withdrawal", () => {
    expect(treasuryWithdrawFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a malformed destination", () => {
    const result = treasuryWithdrawFormSchema.safeParse({
      ...valid,
      destination: "GBAD",
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/valid 56-character Stellar public key/);
  });

  it("requires a destination", () => {
    expect(
      firstMessage(
        treasuryWithdrawFormSchema.safeParse({ ...valid, destination: "" })
      )
    ).toBe("Stellar public key is required");
  });

  it("requires an issuer for non-native assets", () => {
    const result = treasuryWithdrawFormSchema.safeParse({
      ...valid,
      assetCode: "USDC",
    });
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.some((i) => i.path[0] === "assetIssuer")).toBe(true);
  });

  it("rejects an over-precise amount", () => {
    expect(
      firstMessage(
        treasuryWithdrawFormSchema.safeParse({ ...valid, amount: "1.00000001" })
      )
    ).toMatch(/at most 7 decimal place/);
  });

  it("reports nested errors on distinct paths", () => {
    const result = treasuryWithdrawFormSchema.safeParse({
      amount: "0",
      assetCode: "XLM",
      assetIssuer: null,
      destination: "nope",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("amount");
      expect(paths).toContain("destination");
    }
  });
});

// ---------------------------------------------------------------------------
// participantSplitSchema
// ---------------------------------------------------------------------------

describe("participantSplitSchema", () => {
  it("accepts a list of email participants", () => {
    expect(
      participantSplitSchema.safeParse([
        { userId: "u1", contact: "ada@example.com" },
        { userId: "u2", contact: "grace@example.org" },
      ]).success
    ).toBe(true);
  });

  it("accepts a Stellar public key as the contact", () => {
    expect(
      participantSplitSchema.safeParse([
        { userId: "u1", contact: VALID_ISSUER },
      ]).success
    ).toBe(true);
  });

  it("requires at least one participant", () => {
    expect(participantSplitSchema.safeParse([]).success).toBe(false);
  });

  it("rejects an invalid contact", () => {
    const result = participantSplitSchema.safeParse([
      { userId: "u1", contact: "not-an-email" },
    ]);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/valid email address or Stellar public key/);
  });

  it("rejects a duplicated participant", () => {
    const result = participantSplitSchema.safeParse([
      { userId: "u1", contact: "a@example.com" },
      { userId: "u1", contact: "b@example.com" },
    ]);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fieldErrorsFrom
// ---------------------------------------------------------------------------

describe("fieldErrorsFrom", () => {
  it("returns an empty map for a successful parse", () => {
    expect(
      fieldErrorsFrom(createGroupFormSchema.safeParse({ name: "Trip" }))
    ).toEqual({});
  });

  it("keeps the first issue per field and dot-joins nested paths", () => {
    const result = treasuryWithdrawFormSchema.safeParse({
      amount: "0",
      assetCode: "XLM",
      assetIssuer: null,
      destination: "nope",
    });
    const errors = fieldErrorsFrom(result);
    expect(Object.keys(errors).sort()).toEqual(["amount", "destination"]);
    expect(errors.amount).toMatch(/greater than zero/);
    expect(errors.destination).toMatch(/Stellar public key/);
  });

  it("maps array indices to dotted keys", () => {
    const errors = fieldErrorsFrom(
      participantSplitSchema.safeParse([{ userId: "", contact: "bad" }])
    );
    expect(Object.keys(errors)).toContain("0.userId");
  });
});
