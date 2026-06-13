"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-store";
import { useJoinGroup } from "@/lib/queries";
import { ApiRequestError } from "@/lib/api";

export default function JoinByCodePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const router = useRouter();
  const { token, hydrated } = useAuth();
  const join = useJoinGroup();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      // Park the code so login can return here.
      try {
        sessionStorage.setItem("mergepay.pendingInvite", code);
      } catch {}
      router.replace("/login");
      return;
    }
    if (done) return;
    setDone(true);
    join
      .mutateAsync(code)
      .then(({ group }) => {
        toast.success(`Joined ${group.name}`);
        router.replace(`/groups/${group.id}`);
      })
      .catch((e) => {
        toast.error(
          e instanceof ApiRequestError ? e.message : "Invalid or expired invite"
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, code]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper p-6 dotted-bg">
      <Logo markSize={44} />
      <Card className="w-full max-w-sm p-8 text-center">
        <h1 className="font-display text-2xl uppercase tracking-tight">
          Joining group
        </h1>
        <p className="mt-2 font-mono text-sm tracking-widest text-ink/60">
          {code}
        </p>
        {join.isPending || !hydrated ? (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-grape" />
          </div>
        ) : join.isError ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-flamingo">
              This invite could not be used.
            </p>
            <Button onClick={() => router.replace("/dashboard")}>
              Go to dashboard
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
