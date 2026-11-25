import { Horizon } from "@stellar/stellar-sdk";
import { HORIZON_URL, XLM_ASSET } from "../constants";

type HorizonAccountReader = Pick<Horizon.Server, "loadAccount">;

export async function verifyTrustlineBeforeSettlement(
  destinationPublicKey: string,
  assetCode: string,
  assetIssuer: string | null,
  server: HorizonAccountReader = new Horizon.Server(HORIZON_URL)
): Promise<boolean> {
  if (assetCode === XLM_ASSET.code || assetIssuer === null) return true;
  if (!destinationPublicKey || !assetIssuer) {
    throw new Error("A destination account and asset issuer are required to check this trustline.");
  }

  let account;
  try {
    account = await server.loadAccount(destinationPublicKey);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (("status" in error && error.status === 404) ||
        ("response" in error &&
          typeof error.response === "object" &&
          error.response !== null &&
          "status" in error.response &&
          error.response.status === 404))
    ) {
      return false;
    }
    throw new Error("Could not check the recipient's asset trustline.");
  }

  return (
    account.balances.some(
      (balance) =>
        balance.asset_type !== "native" &&
        balance.asset_code === assetCode &&
        balance.asset_issuer === assetIssuer
    ) ?? false
  );
}
