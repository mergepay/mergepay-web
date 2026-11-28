"use client";

import React from "react";
import { useWallet } from "@/lib/hooks/use-wallet";
import { AlertCircle, RefreshCw } from "lucide-react";

export function WalletTimeoutAlert() {
  const { isExpired, reconnect } = useWallet();

  if (!isExpired) {
    return null;
  }

  return (
    <div className="rounded-md bg-amber-50 p-4 border border-amber-200 mb-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-amber-400" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1 md:flex md:justify-between">
          <p className="text-sm text-amber-700">
            Your wallet connection session has expired or been revoked.
          </p>
          <p className="mt-3 text-sm md:mt-0 md:ml-6">
            <button
              type="button"
              onClick={() => reconnect()}
              className="whitespace-nowrap font-medium text-amber-700 hover:text-amber-600 flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Reconnect wallet &rarr;
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
