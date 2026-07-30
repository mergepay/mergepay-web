"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useJoinGroup } from "@/lib/queries";
import {
  describeInviteCodeProblem,
  describeInviteFailure,
  parseInviteCode,
  type InviteRecovery,
} from "@/lib/inviteLink";

/**
 * Codes this browsing session has already attempted.
 *
 * The join effect is guarded by a ref, which resets when the component
 * remounts — as it does when the user navigates back to the invite URL
 * after joining. Without this, back navigation would re-POST the join.
 * Module scope is deliberate: it survives client-side navigation, holds
 * nothing sensitive, and an explicit retry button clears it.
 */
const attemptedCodes = new Set<string>();

export default function JoinByCodePage() {
  const params = useParams<{ code: string | string[] }>();
  const router = useRouter();
  const { token, hydrated } = useAuth();
  const join = useJoinGroup();
  const started = useRef(false);
  const [failure, setFailure] = useState<InviteRecovery | null>(null);

  // Validate before anything else: an invalid identifier must never
  // reach the group or membership endpoints, and must never be parked
  // in storage for the post-login redirect.
  const parsed = useMemo(() => parseInviteCode(params?.code), [params?.code]);
  const code = parsed.ok ? parsed.code : null;

  useEffect(() => {
    if (!parsed.ok) {
      setFailure(describeInviteCodeProblem(parsed));
      return;
    }
    if (!hydrated) return;
    if (!token) {
      // Park the validated code so login can return here.
      try {
        sessionStorage.setItem("mergepay.pendingInvite", parsed.code);
      } catch {}
      router.replace("/login");
      return;
    }
    if (started.current || attemptedCodes.has(parsed.code)) return;
    started.current = true;
    attemptedCodes.add(parsed.code);

    join
      .mutateAsync(parsed.code)
      .then(({ group }) => {
        toast.success(`Joined ${group.name}`);
        router.replace(`/groups/${group.id}`);
      })
      .catch((e) => {
        const recovery = describeInviteFailure(e);
        setFailure(recovery);
        toast.error(recovery.title);
      });
  }, [parsed, hydrated, token, join, router]);

  function retry() {
    if (!code) return;
    // An explicit user action is the only thing that clears the guard,
    // so back navigation never re-submits a join on its own.
    attemptedCodes.delete(code);
    started.current = false;
    setFailure(null);
    join.reset();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper p-6 dotted-bg">
      <Logo markSize={44} />
      <Card className="w-full max-w-sm p-8 text-center">
        {failure ? (
          <>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              {failure.title}
            </h1>
            <p className="mt-3 text-sm text-ink/60" role="alert">
              {failure.description}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {failure.retryable && code && <Button onClick={retry}>Try again</Button>}
              {failure.kind === "sign_in_required" ? (
                <Button variant="outline" onClick={() => router.replace("/login")}>
                  Sign in
                </Button>
              ) : (
                <Button variant="outline" onClick={() => router.replace("/dashboard")}>
                  Go to dashboard
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              Joining group
            </h1>
            {/* Rendered only after validation, so this is a plain
                alphanumeric token — never arbitrary URL content. */}
            <p className="mt-2 font-mono text-sm tracking-widest text-ink/60">
              {code}
            </p>
            <div className="mt-6 flex justify-center" role="status">
              <Loader2 className="h-7 w-7 animate-spin text-grape" />
              <span className="sr-only">Joining group, please wait</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
