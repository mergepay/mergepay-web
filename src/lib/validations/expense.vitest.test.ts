import { describe, expect, it } from "vitest";

import { expenseFormSchema, type ExpenseFormValues } from "./expense";

/** Real USDC issuer on Stellar mainnet/testnet — a valid ed25519 public key. */
const VALID_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

/** Fixture mirroring the payload `AddExpenseDialog` builds before submitting. */
const validEqual = {
  title: "Dinner at Terra Kulture",
  description: "Birthday dinner",
  amount: "150",
  assetCode: "XLM",
  assetIssuer: null as string | null,
  splitType: "equal" as "equal" | "custom" | "percentage",
  shares: [{ userId: "user-a" }, { userId: "user-b" }, { userId: "user-c" }],
  payerUserId: "user-a",
  memo: "MP:dinner-1a2b",
  receiptUrl: null as string | null,
};

function parse(
  overrides: Partial<{
    title: string;
    description: string | null;
    amount: string;
    assetCode: string;
    assetIssuer: string | null;
    splitType: "equal" | "custom" | "percentage";
    shares: { userId: string; amount?: string; percent?: number }[];
    payerUserId: string;
    memo: string | null;
    receiptUrl: string | null;
  }> = {}
) {
  return expenseFormSchema.safeParse({ ...validEqual, ...overrides });
}

function firstMessage(result: ReturnType<typeof parse>): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe("expenseFormSchema — valid submissions", () => {
  it("accepts a well-formed equal split", () => {
    expect(parse().success).toBe(true);
  });

  it("accepts a native asset with no issuer", () => {
    expect(parse({ assetIssuer: null }).success).toBe(true);
    expect(parse({ assetIssuer: undefined }).success).toBe(true);
    expect(parse({ assetIssuer: "" }).success).toBe(true);
  });

  it("accepts a valid issued asset with a real Stellar public key issuer", () => {
    expect(
      parse({ assetCode: "USDC", assetIssuer: VALID_ISSUER }).success
    ).toBe(true);
  });

  it("trims surrounding whitespace on the issuer", () => {
    expect(
      parse({ assetCode: "USDC", assetIssuer: ` ${VALID_ISSUER} ` }).success
    ).toBe(true);
  });

  it("accepts omitted optional fields", () => {
    const result = expenseFormSchema.safeParse({
      title: "Rent",
      amount: "500",
      assetCode: "XLM",
      splitType: "equal",
      shares: [{ userId: "user-a" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("expenseFormSchema — amount", () => {
  it("requires an amount", () => {
    expect(firstMessage(parse({ amount: "" }))).toBe("Amount is required");
  });

  it("rejects negative amounts", () => {
    expect(firstMessage(parse({ amount: "-5" }))).toMatch(/plain number/);
    expect(firstMessage(parse({ amount: "-0.0000001" }))).toMatch(/plain number/);
  });

  it("rejects zero and sub-stroop amounts", () => {
    expect(firstMessage(parse({ amount: "0" }))).toBe(
      "Amount must be greater than zero"
    );
    expect(firstMessage(parse({ amount: "0.0000000" }))).toBe(
      "Amount must be greater than zero"
    );
  });

  it("rejects more than 7 decimal places (Stellar stroop precision)", () => {
    expect(firstMessage(parse({ amount: "1.12345678" }))).toMatch(
      /at most 7 decimal places/
    );
    expect(parse({ amount: "1.1234567" }).success).toBe(true);
  });

  it("rejects scientific notation and trailing junk", () => {
    expect(firstMessage(parse({ amount: "1e5" }))).toMatch(/plain number/);
    expect(firstMessage(parse({ amount: "50abc" }))).toMatch(/plain number/);
  });

  it("rejects amounts too small to split between every participant", () => {
    expect(firstMessage(parse({ amount: "0.0000002" }))).toMatch(
      /too small to split between 3 people/
    );
  });
});

describe("expenseFormSchema — Stellar asset code", () => {
  it("requires an asset code", () => {
    expect(firstMessage(parse({ assetCode: "" }))).toBe("Asset code is required");
  });

  it("rejects codes longer than 12 characters", () => {
    expect(firstMessage(parse({ assetCode: "A".repeat(13) }))).toMatch(
      /1-12 letters or digits/
    );
    expect(parse({ assetCode: "A".repeat(12) }).success).toBe(true);
  });

  it("rejects symbols, currency signs, and separators", () => {
    expect(parse({ assetCode: "US$D" }).success).toBe(false);
    expect(parse({ assetCode: "XLM-2" }).success).toBe(false);
    expect(parse({ assetCode: "US DC" }).success).toBe(false);
  });
});

describe("expenseFormSchema — Stellar issuer public key", () => {
  it("rejects keys with a broken checksum", () => {
    const corrupt = VALID_ISSUER.slice(0, -1) + "M";
    const result = parse({ assetCode: "USDC", assetIssuer: corrupt });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/valid Stellar public key/);
  });

  it("rejects keys that are too short or too long", () => {
    const tooShort = VALID_ISSUER.slice(0, 55);
    expect(parse({ assetIssuer: tooShort }).success).toBe(false);
    expect(parse({ assetIssuer: VALID_ISSUER + "A" }).success).toBe(false);
  });

  it("rejects non-G prefixes (secret keys, muxed, contract ids)", () => {
    expect(parse({ assetIssuer: "S" + VALID_ISSUER.slice(1) }).success).toBe(false);
    expect(parse({ assetIssuer: "M" + VALID_ISSUER.slice(1) }).success).toBe(false);
    expect(parse({ assetIssuer: "C" + VALID_ISSUER.slice(1) }).success).toBe(false);
  });

  it("rejects lowercase and invalid base-32 characters", () => {
    expect(parse({ assetIssuer: VALID_ISSUER.toLowerCase() }).success).toBe(false);
    expect(
      parse({ assetIssuer: VALID_ISSUER.slice(0, 10) + "1" + VALID_ISSUER.slice(11) })
        .success
    ).toBe(false);
  });

  it("rejects a non-string issuer", () => {
    const result = expenseFormSchema.safeParse({
      ...validEqual,
      assetIssuer: 12345,
    });
    expect(result.success).toBe(false);
  });
});

describe("expenseFormSchema — description", () => {
  it("accepts a description and one that is exactly at the cap", () => {
    expect(parse({ description: "Team lunch" }).success).toBe(true);
    expect(parse({ description: "A".repeat(500) }).success).toBe(true);
  });

  it("rejects a description longer than 500 characters", () => {
    expect(firstMessage(parse({ description: "A".repeat(501) }))).toMatch(
      /500 characters or fewer/
    );
  });

  it("rejects control characters", () => {
    expect(parse({ description: "bad\u0000memo" }).success).toBe(false);
    expect(parse({ description: "line\nbreak" }).success).toBe(false);
  });
});

describe("expenseFormSchema — participants", () => {
  it("requires at least one participant", () => {
    expect(firstMessage(parse({ shares: [] }))).toBe(
      "Select at least one participant"
    );
  });

  it("requires a non-empty user id for every participant", () => {
    expect(firstMessage(parse({ shares: [{ userId: "  " }] }))).toBe(
      "Participant is required"
    );
  });

  it("rejects the same participant appearing twice", () => {
    const result = parse({
      shares: [{ userId: "user-a" }, { userId: "user-a" }, { userId: "user-b" }],
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/more than once/);
  });
});

describe("expenseFormSchema — custom split", () => {
  function custom(shares: { userId: string; amount?: string }[]) {
    return parse({ splitType: "custom", shares });
  }

  it("accepts shares that total the amount exactly", () => {
    expect(
      custom([
        { userId: "user-a", amount: "50" },
        { userId: "user-b", amount: "50" },
        { userId: "user-c", amount: "50" },
      ]).success
    ).toBe(true);
  });

  it("rejects shares that exceed the total and reports the difference", () => {
    const result = custom([
      { userId: "user-a", amount: "60" },
      { userId: "user-b", amount: "60" },
      { userId: "user-c", amount: "60" },
    ]);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/over by 30 — they must add up to 150/);
  });

  it("rejects shares that fall short and reports the difference", () => {
    const result = custom([
      { userId: "user-a", amount: "50" },
      { userId: "user-b", amount: "50" },
      { userId: "user-c", amount: "49.9999999" },
    ]);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/short by 0\.0000001/);
  });

  it("rejects negative share amounts", () => {
    const result = custom([
      { userId: "user-a", amount: "160" },
      { userId: "user-b", amount: "-5" },
      { userId: "user-c", amount: "-5" },
    ]);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/plain number/);
  });

  it("rejects zero and missing share amounts", () => {
    const result = custom([
      { userId: "user-a", amount: "150" },
      { userId: "user-b", amount: "" },
      { userId: "user-c", amount: "0" },
    ]);
    expect(result.success).toBe(false);
  });
});

describe("expenseFormSchema — percentage split", () => {
  function percent(shares: { userId: string; percent?: number }[]) {
    return parse({ splitType: "percentage", shares });
  }

  it("accepts percentages totalling exactly 100", () => {
    expect(
      percent([
        { userId: "user-a", percent: 50 },
        { userId: "user-b", percent: 25 },
        { userId: "user-c", percent: 25 },
      ]).success
    ).toBe(true);
  });

  it("rejects percentages that do not total 100", () => {
    const result = percent([
      { userId: "user-a", percent: 40 },
      { userId: "user-b", percent: 40 },
      { userId: "user-c", percent: 10 },
    ]);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/must add up to 100%/);
  });

  it("rejects percentages above 100 or below 0", () => {
    expect(
      percent([
        { userId: "user-a", percent: 120 },
        { userId: "user-b", percent: -20 },
        { userId: "user-c", percent: 0 },
      ]).success
    ).toBe(false);
  });

  it("rejects more than 2 decimal places", () => {
    const result = percent([
      { userId: "user-a", percent: 33.333 },
      { userId: "user-b", percent: 33.333 },
      { userId: "user-c", percent: 33.334 },
    ]);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toMatch(/at most 2 decimal places/);
  });
});

describe("expenseFormSchema — memo and title", () => {
  it("caps the memo at 28 characters and rejects control characters", () => {
    expect(parse({ memo: "A".repeat(28) }).success).toBe(true);
    expect(parse({ memo: "A".repeat(29) }).success).toBe(false);
    expect(parse({ memo: "bad\u0000memo" }).success).toBe(false);
  });

  it("requires a title and caps it at 80 characters", () => {
    expect(firstMessage(parse({ title: "" }))).toBe("Title is required");
    expect(firstMessage(parse({ title: "   " }))).toBe("Title is required");
    expect(parse({ title: "A".repeat(80) }).success).toBe(true);
    expect(parse({ title: "A".repeat(81) }).success).toBe(false);
  });
});

describe("expenseFormSchema — issue paths for inline errors", () => {
  it("reports a bad amount on the amount path", () => {
    const result = parse({ amount: "0" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe("amount");
  });

  it("reports an invalid issuer on the assetIssuer path", () => {
    const result = parse({
      assetCode: "USDC",
      assetIssuer: "GAAAA",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe("assetIssuer");
  });

  it("reports split-sum problems on the shares path", () => {
    const result = parse({
      splitType: "custom",
      shares: [
        { userId: "user-a", amount: "100" },
        { userId: "user-b", amount: "50" },
        { userId: "user-c", amount: "50" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe("shares");
  });

  it("infers a stable parsed type", () => {
    const result = expenseFormSchema.safeParse(validEqual);
    expect(result.success).toBe(true);
    const values: ExpenseFormValues | undefined = result.success
      ? result.data
      : undefined;
    expect(values?.title).toBe("Dinner at Terra Kulture");
  });
});
