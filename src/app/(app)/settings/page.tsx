"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { useMe, useUpdateMe } from "@/lib/queries";
import { ApiRequestError } from "@/lib/api";
import { explorerAccountUrl, STELLAR_NETWORK } from "@/lib/constants";

export default function SettingsPage() {
  const { data: me } = useMe();
  const update = useUpdateMe();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (me?.user) {
      setDisplayName(me.user.displayName);
      setAvatarUrl(me.user.avatarUrl ?? "");
    }
  }, [me]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.message : "Could not save");
    }
  }

  if (!me?.user) return null;
  const user = me.user;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your Mergepay profile and Stellar identity."
      />

      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardContent className="pt-5">
            <form onSubmit={save} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar
                  user={{ ...user, displayName: displayName || user.displayName, avatarUrl: avatarUrl || null }}
                  size="lg"
                />
                <div className="flex-1">
                  <Label htmlFor="s-name">Display name</Label>
                  <Input
                    id="s-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={40}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="s-avatar">Avatar URL (optional)</Label>
                <Input
                  id="s-avatar"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                />
                <FieldHint>Leave blank to use your generated coin avatar.</FieldHint>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={update.isPending}>
                  <Save className="h-4 w-4" /> Save profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <div className="flex items-center justify-between border-b-3 border-ink bg-grape px-5 py-3 text-white">
            <span className="flex items-center gap-2 font-display text-sm uppercase tracking-tight">
              <Wallet className="h-4 w-4" /> Stellar identity
            </span>
            <Badge tone="lime">{STELLAR_NETWORK}</Badge>
          </div>
          <CardContent className="space-y-4 pt-4">
            <div>
              <Label>Public key</Label>
              <div className="flex items-center gap-2">
                <code className="block flex-1 overflow-hidden text-ellipsis rounded-xl border-2 border-ink bg-paper px-3 py-2 font-mono text-xs">
                  {user.stellarPublicKey}
                </code>
                <CopyButton value={user.stellarPublicKey} />
              </div>
            </div>
            <a
              href={explorerAccountUrl(user.stellarPublicKey)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full">
                View on Stellar Explorer <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
            <p className="text-xs text-ink/50">
              Your public key is your Mergepay identity. Authentication uses
              SEP-10 — Mergepay never sees your secret key.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
