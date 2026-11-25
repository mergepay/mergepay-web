declare module "@stellar/freighter-api" {
  export function isConnected(): Promise<{ isConnected: boolean }>;
  export function getPublicKey(): Promise<string>;
  export function getAddress(): Promise<{ address: string; error?: string }>;
  export function requestAccess(): Promise<{ address: string; error?: string }>;
  export function signTransaction(
    xdr: string,
    opts?: { network?: string; networkPassphrase?: string }
  ): Promise<string>;
  export function getNetwork(): Promise<string>;
  export function getNetworkDetails(): Promise<{ network: string; networkPassphrase: string }>;
  export class WatchWalletChanges {
    constructor(intervalMs?: number);
    watch(cb: (params: any) => void): void;
    stop(): void;
  }
}

declare module "@stellar/stellar-sdk" {
  export namespace Horizon {
    class Server {
      constructor(serverURL: string, opts?: { allowHttp?: boolean });
      loadAccount(accountId: string): Promise<{
        balances: Array<{
          asset_type: string;
          asset_code?: string;
          asset_issuer?: string;
        }>;
      }>;
    }
  }
  export class Asset {
    constructor(code: string, issuer?: string);
    static native(): Asset;
    code: string;
    issuer?: string;
  }
  export class Operation {
    static payment(opts: any): any;
    static changeTrust(opts: any): any;
  }
  export class TransactionBuilder {
    constructor(account: any, opts: any);
    addOperation(op: any): TransactionBuilder;
    setTimeout(seconds: number): TransactionBuilder;
    build(): any;
    /** Decodes a (possibly fee-bump) envelope; `hash()` is the network tx hash. */
    static fromXDR(
      envelope: string,
      networkPassphrase: string
    ): { hash(): { toString(encoding: "hex"): string } };
  }
  export class Account {
    constructor(accountId: string, sequence: string);
  }
  export class Memo {
    static text(value: string): Memo;
    type: string;
    value: string;
  }
  export class StrKey {
    static isValidEd25519PublicKey(publicKey: string): boolean;
    static isValidEd25519SecretSeed(seed: string): boolean;
    static isValidMed25519PublicKey(publicKey: string): boolean;
  }
}

declare module "tailwind-merge" {
  export function twMerge(...inputs: any[]): string;
}
