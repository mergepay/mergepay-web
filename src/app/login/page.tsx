"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAuth as useAuthStore } from "@/lib/auth-store";
import { shortKey } from "@/lib/format";
import {
  getWalletNetwork,
  isFreighterAvailable,
  NetworkMismatchError,
  NotInstalledMessage,
  WalletError,
} from "@/lib/stellar";
import {
  describeNetwork,
  EXPECTED_NETWORK_LABEL,
  NETWORK_PASSPHRASE,
} from "@/lib/constants";
import { handleApiError } from "@/lib/errorHandler";
import { inviteJoinPath } from "@/lib/inviteLink";

/**
 * After auth, jump to a parked invite link if one exists, else the
 * dashboard.
 *
 * The parked value is re-validated here rather than trusted: session
 * storage is writable by anything running on the origin, and the value
 * is interpolated into a router path. `inviteJoinPath` returns `null`
 * for anything that is not a well-formed code, so a tampered entry
 * cannot redirect the user somewhere else.
 */
function postLoginTarget(): string {
  try {
    const code = sessionStorage.getItem("mergepay.pendingInvite");
    if (code) {
      sessionStorage.removeItem("mergepay.pendingInvite");
      const target = inviteJoinPath(code);
      if (target) return target;
    }
  } catch {}
  return "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const { token, hydrated, restoring, login, isLoading: authLoading } = useAuth();
  // The wallet's own active account, tracked independently of the
  // session, so the screen names the key the user is about to sign with.
  const activeWalletPublicKey = useAuthStore((s) => s.activeWalletPublicKey);
  const [loading, setLoading] = useState(false);
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);
  // The wallet's network, once we can read it. `null` means "not known" —
  // rendered as no banner at all rather than as a mismatch.
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && token) router.replace(postLoginTarget());
  }, [hydrated, token, router]);

  useEffect(() => {
    isFreighterAvailable().then(setHasFreighter);
  }, []);

  // Best-effort pre-flight read. Freighter only reports its network to an
  // origin it already trusts, so this surfaces the mismatch before the user
  // clicks; everyone else gets it from the check inside `loginWithWallet`.
  useEffect(() => {
    if (hasFreighter !== true) return;
    let active = true;
    getWalletNetwork().then((net) => {
      if (!active || !net) return;
      if (net.networkPassphrase === NETWORK_PASSPHRASE) setWalletNetwork(null);
      else setWalletNetwork(describeNetwork(net.networkPassphrase, net.network));
    });
    return () => {
      active = false;
    };
  }, [hasFreighter]);

  async function handleConnect() {
    setLoading(true);
    try {
      const user = await login();
      if (user) {
        setWalletNetwork(null);
        toast.success("Signed in with Stellar");
        router.replace(postLoginTarget());
      }
    } catch (e) {
      if (e instanceof NetworkMismatchError) {
        // Kept on screen rather than in a toast: fixing this means going into
        // the extension, which takes longer than a toast lives.
        setWalletNetwork(e.walletNetwork);
      } else if (e instanceof WalletError) {
        // Rich message with an install link — shown instead of plain text.
        toast.error(e.code === "not_installed" ? <NotInstalledMessage /> : e.message);
      } else {
        handleApiError(e, "Could not sign in. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* left: brand panel */}
      <div className="relative hidden flex-col justify-between border-r-3 border-ink bg-grape p-10 text-white md:flex dotted-bg">
        <Link href="/">
          <Logo className="[&_span]:text-white [&_.text-grape]:text-lime" />
        </Link>
        <div>
          {/* border tilted right for neobrutalist flair */}
          <div className="mx-auto max-w-sm" style={{ transform: "rotate(3deg)" }}>
            <div
              className="overflow-hidden rounded-3xl border-3 border-ink bg-cream p-2 shadow-brutal"
              style={{ transform: "rotate(-3deg) skewX(-2deg)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/wallet-login.gif"
                alt="Two people paying each other on Stellar"
                className="aspect-[5/4] w-full rounded-2xl object-contain"
                draggable={false}
              />
            </div>
          </div>
          <h2 className="mt-4 font-display text-3xl uppercase leading-tight tracking-tight">
            Your wallet is
            <br /> your login.
          </h2>
          <p className="mt-3 max-w-sm text-grape-pale">
            No passwords, no email. Mergepay authenticates you with SEP-10 —
            your Stellar public key is your identity.
          </p>
        </div>
        <div className="flex gap-4 font-display text-xs uppercase tracking-widest text-grape-pale">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Non-custodial
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-4 w-4" /> SEP-10
          </span>
        </div>
      </div>

      {/* right: connect */}
      <div className="flex flex-col items-center justify-center bg-paper p-6">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1 font-display text-xs uppercase tracking-widest text-ink/60 hover:text-ink md:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-3xl border-3 border-ink bg-cream p-8 shadow-brutal-xl"
          >
            <div className="md:hidden">
              <Logo />
            </div>
            <h1 className="mt-2 font-display text-3xl uppercase tracking-tight">
              Sign in
            </h1>
            <p className="mt-2 text-sm text-ink/60">
              Connect your Stellar wallet to start splitting and settling.
            </p>

            {restoring ? (
              <p
                className="mt-7 flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-butter-pale px-4 py-3 text-sm"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Restoring your session…
              </p>
            ) : (
              <Button
                className="mt-7 w-full"
                size="lg"
                onClick={handleConnect}
                disabled={loading || authLoading}
              >
                {loading || authLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wallet className="h-5 w-5" />
                    Connect Freighter
                  </>
                )}
              </Button>
            )}

            {!restoring && activeWalletPublicKey && (
              <p className="mt-3 text-center text-xs text-ink/60">
                Freighter is on{" "}
                <span className="font-mono font-bold">
                  {shortKey(activeWalletPublicKey)}
                </span>
              </p>
            )}

            {walletNetwork && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-3 rounded-xl border-2 border-ink bg-flamingo-pale px-4 py-3 text-sm"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-cream">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <span>
                  Wrong network. Your wallet is on{" "}
                  <span className="font-bold">{walletNetwork}</span> but Mergepay
                  is on <span className="font-bold">{EXPECTED_NETWORK_LABEL}</span>
                  . Switch networks in Freighter, then try again.
                </span>
              </div>
            )}

            {hasFreighter === false && (
              <div className="mt-4 rounded-xl border-2 border-ink bg-butter-pale px-4 py-3 text-xs">
                No Freighter wallet detected. Install it from{" "}
                <a
                  href="https://www.freighter.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline"
                >
                  freighter.app
                </a>{" "}
                and refresh this page.
              </div>
            )}

            <p className="mt-6 text-center text-xs text-ink/50">
              By continuing you agree to settle on the Stellar{" "}
              <span className="font-bold">{EXPECTED_NETWORK_LABEL}</span>{" "}
              network.
            </p>
          </motion.div>

          <p className="mt-6 text-center text-xs text-ink/50">
            New to Stellar wallets?{" "}
            <a
              href="https://www.freighter.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-grape underline"
            >
              Get Freighter
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
