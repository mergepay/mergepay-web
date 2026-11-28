import { useWallet } from "./use-wallet";

export function useWalletGuard() {
  const { isConnected, isExpired, reconnect } = useWallet();

  const assertCanSubmit = (onSubmit: () => void) => {
    if (!isConnected || isExpired) {
      reconnect();
      return false;
    }
    onSubmit();
    return true;
  };

  return {
    canSubmit: isConnected && !isExpired,
    assertCanSubmit,
  };
}
