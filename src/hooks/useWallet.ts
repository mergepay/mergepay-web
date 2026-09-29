"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WatchWalletChanges,
  isConnected as freighterIsConnected,
} from "@stellar/freighter-api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import {
  autoReconnectWallet,
  connectWallet,
  getGrantedAddress,
  isFreighterAvailable,
  WALLET_CONNECTED_SESSION_KEY,
  WALLET_ADDRESS_SESSION_KEY,
  WalletError,
} from "@/lib/stellar";

export interface UseWalletOptions {
  autoReconnect?: boolean;
  showToasts?: boolean;
}

export interface UseWalletReturn {
  publicKey: string | null;
  isConnected: boolean;
  isLocked: boolean;
  isInstalled: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function useWallet(options: UseWalletOptions = {}): UseWalletReturn {
  const { autoReconnect = true, showToasts = true } = options;

  const activeWalletPublicKey = useAuth((s) => s.activeWalletPublicKey);
  const setActiveWalletPublicKey = useAuth((s) => s.setActiveWalletPublicKey);
  const setConnected = useWalletStore((s) => s.setConnected);

  const [isInstalled, setIsInstalled] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const prevAddressRef = useRef<string | null>(activeWalletPublicKey);
  const initialCheckDoneRef = useRef(false);
  const isConnectingRef = useRef(false);

  // Keep prevAddressRef synchronized
  useEffect(() => {
    prevAddressRef.current = activeWalletPublicKey;
  }, [activeWalletPublicKey]);

  const refresh = useCallback(async () => {
    if (isConnectingRef.current) return;
    try {
      const available = await isFreighterAvailable();
      if (!mountedRef.current) return;

      if (!available) {
        setIsInstalled(false);
        setIsLocked(false);
        setConnected(false);
        setActiveWalletPublicKey(null);
        return;
      }

      setIsInstalled(true);

      let connected = false;
      try {
        const res = await freighterIsConnected();
        connected = typeof res === "boolean" ? res : Boolean(res?.isConnected);
      } catch {
        connected = false;
      }

      if (!connected) {
        setIsLocked(false);
        setConnected(false);
        setActiveWalletPublicKey(null);
        return;
      }

      let address: string | null = null;
      let locked = false;

      try {
        address = await getGrantedAddress();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("locked")) {
          locked = true;
        }
      }

      if (!mountedRef.current) return;

      setIsLocked(locked);

      if (locked) {
        setConnected(false);
        setActiveWalletPublicKey(null);
        return;
      }

      if (address) {
        setConnected(true);
        setActiveWalletPublicKey(address);
      } else {
        setConnected(false);
        setActiveWalletPublicKey(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "Error checking wallet";
      setError(msg);
    }
  }, [setActiveWalletPublicKey, setConnected]);

  // Initial check & auto-reconnect
  useEffect(() => {
    mountedRef.current = true;

    async function initialize() {
      if (!autoReconnect) {
        await refresh();
        initialCheckDoneRef.current = true;
        return;
      }

      try {
        const available = await isFreighterAvailable();
        if (!mountedRef.current) return;

        if (!available) {
          setIsInstalled(false);
          setConnected(false);
          initialCheckDoneRef.current = true;
          return;
        }

        setIsInstalled(true);

        const result = await autoReconnectWallet();
        if (!mountedRef.current) return;

        if (result.success) {
          setActiveWalletPublicKey(result.publicKey);
          setConnected(true);
          setIsLocked(false);
        } else if (result.reason === "locked") {
          setIsLocked(true);
          setConnected(false);
          setActiveWalletPublicKey(null);
        } else {
          // Fall back to probe
          await refresh();
        }
      } catch {
        if (mountedRef.current) {
          await refresh();
        }
      } finally {
        if (mountedRef.current) {
          initialCheckDoneRef.current = true;
        }
      }
    }

    void initialize();

    return () => {
      mountedRef.current = false;
    };
  }, [autoReconnect, refresh, setActiveWalletPublicKey, setConnected]);

  // Watcher for account changes and disconnect events from Freighter
  useEffect(() => {
    let watcher: WatchWalletChanges | null = null;

    try {
      watcher = new WatchWalletChanges(1500);
      watcher.watch((params) => {
        if (!mountedRef.current) return;

        if (params.error) {
          const errLower = params.error.toLowerCase();
          if (errLower.includes("locked")) {
            setIsLocked(true);
            setConnected(false);
            if (activeWalletPublicKey) {
              setActiveWalletPublicKey(null);
              if (showToasts) {
                toast.warning("Freighter wallet is locked. Please unlock it.");
              }
            }
          }
          return;
        }

        const newAddress = params.address || null;
        const prevAddress = prevAddressRef.current;

        if (newAddress && newAddress !== prevAddress) {
          setIsLocked(false);
          setConnected(true);
          setActiveWalletPublicKey(newAddress);
          prevAddressRef.current = newAddress;

          if (typeof window !== "undefined") {
            sessionStorage.setItem(WALLET_CONNECTED_SESSION_KEY, "true");
            sessionStorage.setItem(WALLET_ADDRESS_SESSION_KEY, newAddress);
          }

          if (showToasts && initialCheckDoneRef.current) {
            toast.info(`Freighter account switched to ${truncateAddress(newAddress)}`);
          }
        } else if (!newAddress && prevAddress) {
          // Account disconnected
          setConnected(false);
          setActiveWalletPublicKey(null);
          prevAddressRef.current = null;

          if (typeof window !== "undefined") {
            sessionStorage.removeItem(WALLET_CONNECTED_SESSION_KEY);
            sessionStorage.removeItem(WALLET_ADDRESS_SESSION_KEY);
          }

          if (showToasts && initialCheckDoneRef.current) {
            toast.info("Freighter wallet disconnected.");
          }
        }
      });
    } catch (err) {
      // Gracefully catch errors when registering extension listeners
      console.warn("Could not register WatchWalletChanges:", err);
    }

    return () => {
      try {
        watcher?.stop();
      } catch {
        // Ignore stop errors on unmount
      }
    };
  }, [activeWalletPublicKey, setActiveWalletPublicKey, setConnected, showToasts]);

  const connect = useCallback(async (): Promise<string | null> => {
    isConnectingRef.current = true;
    setIsConnecting(true);
    setError(null);

    try {
      const pubKey = await connectWallet();
      if (!mountedRef.current) return pubKey;

      setActiveWalletPublicKey(pubKey);
      setConnected(true);
      setIsLocked(false);
      prevAddressRef.current = pubKey;

      if (showToasts) {
        toast.success(`Connected to Freighter (${truncateAddress(pubKey)})`);
      }
      return pubKey;
    } catch (err) {
      if (!mountedRef.current) return null;

      let msg = "Could not connect to Freighter wallet.";
      if (err instanceof WalletError) {
        msg = err.message;
        if (err.code === "locked") {
          setIsLocked(true);
        } else if (err.code === "not_installed") {
          setIsInstalled(false);
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }

      setError(msg);
      if (showToasts) {
        toast.error(msg);
      }
      return null;
    } finally {
      isConnectingRef.current = false;
      if (mountedRef.current) {
        setIsConnecting(false);
      }
    }
  }, [setActiveWalletPublicKey, setConnected, showToasts]);

  const disconnect = useCallback(() => {
    setActiveWalletPublicKey(null);
    setConnected(false);
    prevAddressRef.current = null;

    if (typeof window !== "undefined") {
      sessionStorage.removeItem(WALLET_CONNECTED_SESSION_KEY);
      sessionStorage.removeItem(WALLET_ADDRESS_SESSION_KEY);
    }

    if (showToasts) {
      toast.info("Freighter wallet disconnected.");
    }
  }, [setActiveWalletPublicKey, setConnected, showToasts]);

  return {
    publicKey: activeWalletPublicKey,
    isConnected: Boolean(activeWalletPublicKey),
    isLocked,
    isInstalled,
    isConnecting,
    error,
    connect,
    disconnect,
    refresh,
  };
}
