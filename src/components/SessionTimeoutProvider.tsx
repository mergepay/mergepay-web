"use client";

import React from "use client";
import { useWallet } from "@/lib/hooks/use-wallet";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function SessionTimeoutProvider() {
  const { isExpired, reconnect } = useWallet();

  if (!isExpired) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-slate-950 px-4 py-3 shadow-md flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center space-x-2">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm font-medium">
          Freighter wallet session expired or authorization was lost. Please reconnect to continue.
        </span>
      </div>
      <button
        onClick={() => reconnect()}
        className="bg-slate-950 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center space-x-1"
      >
        <RefreshCw className="w-3.5 h-3.5 mr-1" />
        Reconnect
      </button>
    </div>
  );
}
