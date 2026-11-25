import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyTrustlineBeforeSettlement } from "../settlement/trustline";

const DESTINATION = "GDESTINATION";
const ISSUER = "GISSUER";

describe("verifyTrustlineBeforeSettlement", () => {
  it("checks the destination for the exact asset code and issuer", async () => {
    let requestedAccount = "";
    const server = {
      loadAccount: async (accountId: string) => {
        requestedAccount = accountId;
        return {
          balances: [
            {
              asset_type: "credit_alphanum4",
              asset_code: "USDC",
              asset_issuer: ISSUER,
            },
          ],
        };
      },
    };

    assert.equal(await verifyTrustlineBeforeSettlement(DESTINATION, "USDC", ISSUER, server), true);
    assert.equal(requestedAccount, DESTINATION);
  });

  it("rejects a matching asset code from a different issuer", async () => {
    const server = {
      loadAccount: async () => ({
        balances: [
          { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GOTHER" },
        ],
      }),
    };

    assert.equal(await verifyTrustlineBeforeSettlement(DESTINATION, "USDC", ISSUER, server), false);
  });

  it("returns false when the destination account does not exist", async () => {
    const server = {
      loadAccount: async () => {
        throw Object.assign(new Error("not found"), { response: { status: 404 } });
      },
    };

    assert.equal(await verifyTrustlineBeforeSettlement(DESTINATION, "USDC", ISSUER, server), false);
  });

  it("does not query Horizon for native XLM", async () => {
    const server = {
      loadAccount: async () => {
      throw new Error("native XLM should not query Horizon");
      },
    };

    assert.equal(await verifyTrustlineBeforeSettlement(DESTINATION, "XLM", null, server), true);
  });

  it("throws when Horizon cannot verify the account", async () => {
    const server = {
      loadAccount: async () => {
        throw Object.assign(new Error("service unavailable"), { response: { status: 503 } });
      },
    };

    await assert.rejects(
      verifyTrustlineBeforeSettlement(DESTINATION, "USDC", ISSUER, server),
      /Could not check the recipient's asset trustline/
    );
  });
});