import {
  CONFIGURED_NETWORK,
  explorerTxUrl as buildExplorerTxUrl,
  type StellarNetwork,
} from "@/lib/explorer";
import { shortHash } from "@/lib/format";
import { validateMergepayMemo } from "@/lib/validations/memo";

export { CONFIGURED_NETWORK, shortHash, type StellarNetwork };

export function explorerTxUrl(
  memo: string | null | undefined,
  txHash: string | null | undefined,
  network: StellarNetwork = CONFIGURED_NETWORK
) {
  const result = validateMergepayMemo(memo, { required: true });
  return {
    ...result,
    txUrl: buildExplorerTxUrl(txHash, network),
  };
}
