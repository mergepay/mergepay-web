import { useState, useEffect, useCallback } from 'react';
import { isConnected, getPublicKey, setAllowed } from '@stellar/freighter-api';

export interface WalletState {
  isConnected: boolean;
  publicKey: string | null;
  isExpired: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    publicKey: null,
    isExpired: false,
    isLoading: true,
    error: null,
  });

  const checkConnection = useCallback(async () => {
    try {
      const connected = await isConnected();
      if (!connected) {
        setState(prev => ({
          ...prev,
          isConnected: false,
          publicKey: null,
          isExpired: prev.publicKey !== null,
          isLoading: false,
        }));
        return;
      }

      const keyData = await getPublicKey();
      const pubKey = typeof keyData === 'string' ? keyData : (keyData as any)?.publicKey;
      if (!pubKey) {
        setState(prev => ({
          ...prev,
          isConnected: false,
          publicKey: null,
          isExpired: true,
          isLoading: false,
        }));
        return;
      }

      setState({
        isConnected: true,
        publicKey: pubKey,
        isExpired: false,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        publicKey: null,
        isExpired: true,
        isLoading: false,
        error: err?.message || 'Failed to connect to Freighter',
      }));
    }
  }, []);

  const reconnect = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      await setAllowed();
      await checkConnection();
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err?.message || 'Reconnection failed',
      }));
    }
  }, [checkConnection]);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  return {
    ...state,
    reconnect,
    checkConnection,
  };
}
