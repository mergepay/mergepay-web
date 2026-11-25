import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasAccountTrustline,
  verifyAccountTrustlines,
  calculateRequiredReserve,
  hasSufficientReserve,
  buildChangeTrustXdr,
  addTrustlineWithFreighter,
  type AccountBalanceItem,
  type RequiredAsset,
} from "../trustlines";
import { WalletError } from "@/lib/stellar";

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>();
  return {
    ...actual,
    signXdr: vi.fn(),
    submitSignedXdr: vi.fn(),
  };
});

const ISSUER_USDC = "GDXNIQTN6GJ5QB3IIKUB7FW67IMPSTMBNSG4GBT7R72ZH2YOGUF43RJA";
const ISSUER_EURC = "GBNBQTGS7V65OKEY3NBXVRIJOCDOFUOXYBAOKL5I2MHYXK2MCOW6MMEF";
const TEST_ACCOUNT = "GCFXHS4GXL6BVUCXBWXGTITROWLVYXQKQLF4YH5O5JT3YZXCYPAFBJZB";

describe("Trustline Verification Helpers (#357)", () => {
  const mockBalances: AccountBalanceItem[] = [
    { asset_type: "native", balance: "25.0000000" },
    {
      asset_type: "credit_alphanum4",
      asset_code: "USDC",
      asset_issuer: ISSUER_USDC,
      balance: "100.5000000",
      limit: "1000000.0000000",
    },
  ];

  it("identifies that native XLM always has an active trustline", () => {
    expect(hasAccountTrustline(mockBalances, "XLM", null)).toBe(true);
    expect(hasAccountTrustline([], "XLM", null)).toBe(true);
  });

  it("identifies existing asset trustlines accurately", () => {
    expect(hasAccountTrustline(mockBalances, "USDC", ISSUER_USDC)).toBe(true);
    expect(hasAccountTrustline(mockBalances, "USDC", "GOTHERISSUER")).toBe(false);
    expect(hasAccountTrustline(mockBalances, "EURC", ISSUER_EURC)).toBe(false);
  });

  it("verifies multiple required assets against account balances", () => {
    const required: RequiredAsset[] = [
      { code: "XLM", issuer: null },
      { code: "USDC", issuer: ISSUER_USDC },
      { code: "EURC", issuer: ISSUER_EURC },
    ];

    const result = verifyAccountTrustlines(mockBalances, required);
    expect(result.ready).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].code).toBe("EURC");

    const onlyReady: RequiredAsset[] = [
      { code: "XLM", issuer: null },
      { code: "USDC", issuer: ISSUER_USDC },
    ];
    const readyResult = verifyAccountTrustlines(mockBalances, onlyReady);
    expect(readyResult.ready).toBe(true);
    expect(readyResult.missing).toHaveLength(0);
  });

  it("calculates minimum required reserve accurately", () => {
    // 2 base entries + 1 existing subentry + 1 new trustline = 4 entries * 0.5 XLM = 2.0 XLM
    const reserve = calculateRequiredReserve(1, 1);
    expect(reserve).toBe(2.0);
  });

  it("checks whether account has sufficient reserve for new trustlines", () => {
    // Current subentries: 1. Needs 2.0 XLM reserve + buffer.
    expect(hasSufficientReserve("2.5", 1, 1)).toBe(true);
    expect(hasSufficientReserve("1.8", 1, 1)).toBe(false);
    expect(hasSufficientReserve("0", 0, 1)).toBe(false);
  });

  it("builds valid changeTrust XDR", () => {
    const xdr = buildChangeTrustXdr(
      TEST_ACCOUNT,
      "123456789",
      "USDC",
      ISSUER_USDC
    );
    expect(typeof xdr).toBe("string");
    expect(xdr.length).toBeGreaterThan(50);
  });
});

describe("addTrustlineWithFreighter Error Handling (#357)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sequence: "12345" }),
    });
  });

  it("handles op_low_reserve error with descriptive message", async () => {
    const { signXdr } = await import("@/lib/stellar");
    vi.mocked(signXdr).mockRejectedValueOnce(new Error("Transaction failed with op_low_reserve"));

    await expect(
      addTrustlineWithFreighter(TEST_ACCOUNT, "USDC", ISSUER_USDC)
    ).rejects.toThrow(/Insufficient XLM reserve/);
  });

  it("handles user rejection with descriptive message", async () => {
    const { signXdr } = await import("@/lib/stellar");
    vi.mocked(signXdr).mockRejectedValueOnce(new Error("User cancelled the request"));

    await expect(
      addTrustlineWithFreighter(TEST_ACCOUNT, "USDC", ISSUER_USDC)
    ).rejects.toThrow(/You cancelled the request/);
  });
});
