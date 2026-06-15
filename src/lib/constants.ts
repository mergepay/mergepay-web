export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const STELLAR_NETWORK =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as "testnet" | "public") ?? "public";

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org";

export const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === "public"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";

export const EXPLORER_BASE = `https://stellar.expert/explorer/${
  STELLAR_NETWORK === "public" ? "public" : "testnet"
}`;

export const STABLE_ASSET = {
  code: process.env.NEXT_PUBLIC_STABLE_ASSET_CODE ?? "USDC",
  issuer:
    process.env.NEXT_PUBLIC_STABLE_ASSET_ISSUER ??
    "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

export const XLM_ASSET = { code: "XLM", issuer: null as string | null };

export const SETTLEMENT_ASSETS = [
  XLM_ASSET,
  { code: STABLE_ASSET.code, issuer: STABLE_ASSET.issuer as string | null },
];

export const TOKEN_STORAGE_KEY = "mergepay.token";

export function explorerTxUrl(hash: string) {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

export function explorerAccountUrl(publicKey: string) {
  return `${EXPLORER_BASE}/account/${publicKey}`;
}
