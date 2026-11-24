import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface Sep24TriggerProps {
  mode: 'deposit' | 'withdrawal';
  anchorDomain?: string;
  supportedAssets?: Array<{ code: string; issuer?: string; name?: string }>;
}

export function Sep24Trigger({ mode, anchorDomain = 'testanchor.stellar.org', supportedAssets = [{ code: 'USDC', name: 'USD Coin' }, { code: 'EURT', name: 'Euro Token' }] }: Sep24TriggerProps) {
  const [open, setOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(supportedAssets[0]?.code || 'USDC');
  const [loading, setLoading] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleStartSession = async () => {
    setLoading(true);
    try {
      // Simulate SEP-24 endpoint request or fetch interactive URL
      await new Promise((resolve) => setTimeout(resolve, 800));
      const mockUrl = `https://${anchorDomain}/sep24/interactive?asset_code=${selectedAsset}&kind=${mode}`;
      setIframeUrl(mockUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setIframeUrl(null);
    queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) handleClose(); }}>
      <DialogTrigger asChild>
        <Button variant="default" className="capitalize">
          {mode}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="capitalize">{mode} via SEP-24 Anchor</DialogTitle>
        </DialogHeader>
        {!iframeUrl ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Select Asset</label>
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {supportedAssets.map((asset) => (
                    <SelectItem key={asset.code} value={asset.code}>
                      {asset.code} {asset.name ? `- ${asset.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartSession} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative w-full h-[450px] border rounded-md overflow-hidden bg-background">
              <iframe
                src={iframeUrl}
                title="SEP-24 Interactive Flow"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleClose}>
                Done / Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
