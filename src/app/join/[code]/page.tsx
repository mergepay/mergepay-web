"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Users, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useJoinGroup, useInviteByCode } from "@/lib/queries";
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
  const { token, restoring } = useAuth();
  const join = useJoinGroup();
  const started = useRef(false);
  const [failure, setFailure] = useState<InviteRecovery | null>(null);
  const [joining, setJoining] = useState(false);

  // Validate before anything else: an invalid identifier must never
  // reach the group or membership endpoints, and must never be parked
  // in storage for the post-login redirect.
  const parsed = useMemo(() => parseInviteCode(params?.code), [params?.code]);
  const code = parsed.ok ? parsed.code : null;

  // Fetch invite details to show group identity before joining.
  const inviteQuery = useInviteByCode(code);
  const invite = inviteQuery.data?.invite;

  // Handle malformed code immediately.
  useEffect(() => {
    if (!parsed.ok) {
      setFailure(describeInviteCodeProblem(parsed));
    }
  }, [parsed]);

  // Redirect unauthenticated users to login, parking the code for return.
  useEffect(() => {
    if (!parsed.ok || restoring) return;
    if (!token) {
      try {
        sessionStorage.setItem("mergepay.pendingInvite", parsed.code);
      } catch {}
      router.replace("/login");
    }
  }, [parsed, restoring, token, router]);

  // Handle invite fetch errors (expired, revoked, not found, etc.)
  useEffect(() => {
    if (!inviteQuery.isError) return;
    const recovery = describeInviteFailure(inviteQuery.error);
    setFailure(recovery);
  }, [inviteQuery.isError, inviteQuery.error]);

  async function handleJoin() {
    if (!code || joining || started.current || attemptedCodes.has(code)) return;
    started.current = true;
    attemptedCodes.add(code);
    setJoining(true);
    setFailure(null);

    try {
      const { group } = await join.mutateAsync(code);
      toast.success(`Joined ${group.name}`);
      router.replace(`/groups/${group.id}`);
    } catch (e) {
      const recovery = describeInviteFailure(e);
      setFailure(recovery);
      toast.error(recovery.title);
      started.current = false;
      attemptedCodes.delete(code);
      setJoining(false);
    }
  }

  function retry() {
    if (!code) return;
    attemptedCodes.delete(code);
    started.current = false;
    setFailure(null);
    setJoining(false);
    join.reset();
    inviteQuery.refetch();
  }

  const isInvalidCode = !parsed.ok;
  const isLoadingInvite = code && !isInvalidCode && inviteQuery.isLoading;
  const showInviteError = failure && !joining;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper p-6 dotted-bg">
      <Logo markSize={44} />
      <Card className="w-full max-w-sm p-8 text-center">
        {isInvalidCode && failure ? (
          <>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              {failure.title}
            </h1>
            <p className="mt-3 text-sm text-ink/60" role="alert">
              {failure.description}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => router.replace("/dashboard")}>
                Go to dashboard
              </Button>
            </div>
          </>
        ) : isLoadingInvite ? (
          <>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              Loading invite
            </h1>
            <p className="mt-2 font-mono text-sm tracking-widest text-ink/60">
              {code}
            </p>
            <div className="mt-6 flex justify-center" role="status">
              <Loader2 className="h-7 w-7 animate-spin text-grape" />
              <span className="sr-only">Loading invite details, please wait</span>
            </div>
          </>
        ) : showInviteError ? (
          <>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              {failure.title}
            </h1>
            <p className="mt-3 text-sm text-ink/60" role="alert">
              {failure.description}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {failure.retryable && code && (
                <Button onClick={retry}>Try again</Button>
              )}
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
        ) : invite ? (
          <>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              Join {invite.groupId ? "group" : "MergePay"}
            </h1>
            <p className="mt-3 text-sm text-ink/60">
              You&apos;ve been invited to join a group on MergePay.
            </p>

            <div className="mt-5 space-y-3 text-left">
              {invite.groupId && (
                <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-cream px-4 py-3">
                  <Users className="h-5 w-5 text-grape" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Group</p>
                    <p className="text-sm text-ink/60 font-mono">{invite.groupId}</p>
                  </div>
                </div>
              )}

              {invite.expiresAt && (
                <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-cream px-4 py-3">
                  <Clock className="h-5 w-5 text-tangerine" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Expires</p>
                    <p className="text-sm text-ink/60">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {invite.maxUses && (
                <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-cream px-4 py-3">
                  <ShieldAlert className="h-5 w-5 text-aqua" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Uses remaining</p>
                    <p className="text-sm text-ink/60">
                      {invite.maxUses - invite.uses} of {invite.maxUses}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <Button
                onClick={() => void handleJoin()}
                loading={joining}
                disabled={joining || restoring}
              >
                Join group
              </Button>
              <Button variant="ghost" onClick={() => router.replace("/dashboard")}>
                Maybe later
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl uppercase tracking-tight">
              Joining group
            </h1>
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
