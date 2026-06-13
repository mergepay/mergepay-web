"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LottieIllo, CoinsIllustration, LOTTIE } from "@/components/lottie-illo";
import { useAuth } from "@/lib/auth-store";
import { loginWithWallet, isFreighterAvailable, WalletError } from "@/lib/stellar";
import { ApiRequestError } from "@/lib/api";

/** After auth, jump to a parked invite link if one exists, else the dashboard. */
function postLoginTarget(): string {
  try {
    const code = sessionStorage.getItem("mergepay.pendingInvite");
    if (code) {
      sessionStorage.removeItem("mergepay.pendingInvite");
      return `/join/${code}`;
    }
  } catch {}
  return "/dashboard";
}

export default function LoginPage() {
  const router = useRouter();
  const { token, hydrated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);

  useEffect(() => {
    if (hydrated && token) router.replace(postLoginTarget());
  }, [hydrated, token, router]);

  useEffect(() => {
    isFreighterAvailable().then(setHasFreighter);
  }, []);

  async function handleConnect() {
    setLoading(true);
    try {
      await loginWithWallet();
      toast.success("Signed in with Stellar");
      router.replace(postLoginTarget());
    } catch (e) {
      if (e instanceof WalletError) toast.error(e.message);
      else if (e instanceof ApiRequestError) toast.error(e.message);
      else toast.error("Could not sign in. Please try again.");
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
          <div className="mx-auto max-w-sm rounded-3xl border-3 border-ink bg-cream/10 p-2">
            <LottieIllo
              src={LOTTIE.paymentHands}
              className="aspect-square w-full"
              label="Payment confirmed on Stellar"
              fallback={<CoinsIllustration />}
            />
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

            <Button
              className="mt-7 w-full"
              size="lg"
              onClick={handleConnect}
              loading={loading}
            >
              <Wallet className="h-5 w-5" /> Connect Freighter
            </Button>

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
              <span className="font-bold uppercase">
                {process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet"}
              </span>{" "}
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
