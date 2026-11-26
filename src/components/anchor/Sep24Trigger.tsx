import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sep24Modal } from '@/components/anchor/Sep24Modal';

interface Sep24TriggerProps {
  mode: 'deposit' | 'withdrawal';
  anchorDomain?: string;
  supportedAssets?: Array<{ code: string; issuer?: string; name?: string }>;
}

export function Sep24Trigger({ mode, supportedAssets = [{ code: 'USDC', name: 'USD Coin' }, { code: 'EURT', name: 'Euro Token' }] }: Sep24TriggerProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const assetCode = supportedAssets[0]?.code || 'USDC';

  const handleClose = () => {
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="capitalize">
        {mode}
      </Button>
      <Sep24Modal
        open={open}
        onClose={handleClose}
        kind={mode}
        assetCode={assetCode}
      />
    </>
  );
}
