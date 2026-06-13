"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  FileCheck2,
  Github,
  Globe,
  Layers,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Marquee } from "@/components/marquee";
import { LottieIllo, CoinsIllustration, LOTTIE } from "@/components/lottie-illo";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink overflow-x-hidden">
      <Nav />
      <Hero />
      <Marquee
        items={[
          "Stellar settlement",
          "SEP-10 wallet login",
          "Low fees",
          "On-chain receipts",
          "Shared treasuries",
          "Anchor on/off-ramp",
          "Open source",
        ]}
      />
      <HowItWorks />
      <Features />
      <StellarSection />
      <DemoFlow />
      <CTA />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b-3 border-ink bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Logo />
        <nav className="hidden items-center gap-7 font-display text-xs uppercase tracking-widest md:flex">
          <a href="#how" className="hover:text-grape transition-colors">How it works</a>
          <a href="#features" className="hover:text-grape transition-colors">Features</a>
          <a href="#stellar" className="hover:text-grape transition-colors">Stellar</a>
          <a
            href="https://github.com/Cjay-Cyber-2/mergepay-web"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-grape transition-colors"
          >
            <Github className="h-4 w-4" /> Repo
          </a>
        </nav>
        <Link href="/login">
          <Button size="sm">
            Launch app <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative dotted-bg">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-2 rounded-xl border-3 border-ink bg-lime px-3 py-1 font-display text-xs uppercase tracking-widest shadow-brutal">
            <Sparkles className="h-4 w-4" /> Stellar-native settlement
          </span>
          <h1 className="mt-5 font-display text-5xl leading-[0.95] tracking-tight md:text-7xl">
            Split bills.
            <br />
            <span className="text-grape">Settle</span> on{" "}
            <span className="relative inline-block">
              Stellar.
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 200 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2 8 Q50 2 100 7 T198 5"
                  stroke="#FF8A3C"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-ink/70">
            Mergepay turns shared spending into transparent, auditable, low-fee
            on-chain payments for friends, roommates, trips, and small
            communities.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login">
              <Button size="lg">
                <Wallet className="h-5 w-5" /> Connect wallet
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline">
                See how it works
              </Button>
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-display text-xs uppercase tracking-widest text-ink/60">
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-tangerine" /> Instant finality
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-grape" /> Non-custodial
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-flamingo" /> Memo receipts
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative"
        >
          <div className="absolute -left-4 -top-4 h-full w-full rounded-3xl border-3 border-ink bg-grape" />
          <div className="relative rounded-3xl border-3 border-ink bg-cream p-6 shadow-brutal-xl">
            <div className="rounded-2xl border-3 border-ink bg-grape-pale overflow-hidden">
              <LottieIllo
                src={LOTTIE.coins}
                className="mx-auto h-56 w-full"
                label="Coins merging into one settlement"
                fallback={<CoinsIllustration />}
              />
            </div>
            <SplitPreview />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SplitPreview() {
  const rows = [
    { name: "Ada", amount: "12.50", color: "#6C4DF6", owed: false },
    { name: "Kola", amount: "12.50", color: "#FF8A3C", owed: true },
    { name: "Zo", amount: "12.50", color: "#3DD6C3", owed: true },
  ];
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between border-3 border-ink rounded-xl bg-butter px-4 py-2.5 shadow-brutal-sm">
        <span className="font-display text-sm uppercase">Dinner · split equal</span>
        <span className="font-mono font-bold">37.50 XLM</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          className="flex items-center justify-between rounded-xl border-2 border-ink bg-white px-4 py-2"
        >
          <span className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-lg border-2 border-ink text-[10px] font-display"
              style={{ backgroundColor: r.color }}
            >
              {r.name[0]}
            </span>
            <span className="font-bold">{r.name}</span>
          </span>
          <span
            className={`font-mono text-sm font-bold ${
              r.owed ? "text-flamingo" : "text-lime-dark"
            }`}
          >
            {r.owed ? `owes ${r.amount}` : "paid"}
          </span>
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <Wallet className="h-7 w-7" />,
      title: "Connect & group up",
      body: "Sign in with your Stellar wallet via SEP-10. Create a circle and invite friends with a link.",
      tone: "bg-grape text-white",
    },
    {
      icon: <Receipt className="h-7 w-7" />,
      title: "Add the expense",
      body: "One person pays the merchant. Log it, pick equal, custom, or percentage split — Mergepay does the math.",
      tone: "bg-tangerine text-ink",
    },
    {
      icon: <Zap className="h-7 w-7" />,
      title: "Settle on-chain",
      body: "Each member settles their share in XLM or a stablecoin. The memo links the payment to the exact expense.",
      tone: "bg-lime text-ink",
    },
    {
      icon: <FileCheck2 className="h-7 w-7" />,
      title: "Track transparently",
      body: "Every settlement carries a transaction hash and receipt. The group ledger updates instantly for everyone.",
      tone: "bg-flamingo text-ink",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-20">
      <SectionHeader
        kicker="How it works"
        title="From shared bill to on-chain proof in four steps"
      />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="rounded-2xl border-3 border-ink bg-cream p-5 shadow-brutal"
          >
            <div
              className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-3 border-ink shadow-brutal-sm ${s.tone}`}
            >
              {s.icon}
            </div>
            <span className="font-mono text-xs text-ink/40">0{i + 1}</span>
            <h3 className="mt-1 font-display text-lg uppercase tracking-tight">
              {s.title}
            </h3>
            <p className="mt-2 text-sm text-ink/70">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: <Users className="h-6 w-6" />,
      title: "Expense circles",
      body: "Each group gets a dedicated Stellar-backed settlement space with its own ledger and members.",
      tone: "bg-grape-pale",
    },
    {
      icon: <Layers className="h-6 w-6" />,
      title: "Shared treasury",
      body: "Pool funds for rent or trips in a multi-sig group wallet. Withdrawals need signer approval.",
      tone: "bg-lime-pale",
    },
    {
      icon: <Banknote className="h-6 w-6" />,
      title: "Anchor on/off-ramp",
      body: "Move between fiat and Stellar assets through SEP-24 anchors — no crypto expertise required.",
      tone: "bg-tangerine-pale",
    },
    {
      icon: <Receipt className="h-6 w-6" />,
      title: "Proof of payment",
      body: "Every settlement carries a memo reference, transaction hash, and an exportable audit trail.",
      tone: "bg-flamingo-pale",
    },
    {
      icon: <ShieldCheck className="h-6 w-6" />,
      title: "Non-custodial",
      body: "Your keys stay in your wallet. Mergepay only ever builds transactions for you to sign.",
      tone: "bg-aqua-pale",
    },
    {
      icon: <Globe className="h-6 w-6" />,
      title: "XLM + stablecoins",
      body: "Settle in native XLM for demos or a stable asset like USDC for real-world value.",
      tone: "bg-butter-pale",
    },
  ];
  return (
    <section id="features" className="grid-bg border-y-3 border-ink py-20">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeader
          kicker="Why Mergepay"
          title="More than who-owes-who. Real settlement, fully traceable."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              className="group rounded-2xl border-3 border-ink bg-cream p-6 shadow-brutal transition-all duration-100 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-brutal-lg"
            >
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl border-3 border-ink ${f.tone} shadow-brutal-sm`}
              >
                {f.icon}
              </div>
              <h3 className="font-display text-base uppercase tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-ink/70">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StellarSection() {
  const points = [
    "SEP-10 wallet authentication — your public key is your identity.",
    "Stellar payments & path payments settle balances in seconds.",
    "Trustlines unlock stablecoin support alongside native XLM.",
    "Memos bind every payment to a specific expense for clean audit trails.",
    "Multisig accounts secure shared group treasuries.",
    "SEP-24 anchors bridge fiat and Stellar without leaving the app.",
  ];
  return (
    <section id="stellar" className="mx-auto max-w-6xl px-5 py-20">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="absolute -right-4 -bottom-4 h-full w-full rounded-3xl border-3 border-ink bg-lime" />
          <div className="relative rounded-3xl border-3 border-ink bg-ink p-8 shadow-brutal-xl">
            <LogoMark size={64} className="mb-6" />
            <div className="space-y-3 font-mono text-sm text-lime">
              <div className="flex items-center gap-2">
                <span className="text-tangerine">$</span> payment → GABC…X7Q
              </div>
              <div className="text-paper/70">asset: USDC · amount: 12.50</div>
              <div className="text-paper/70">memo: MP:dinner-8f3a</div>
              <div className="flex items-center gap-2 text-aqua">
                <FileCheck2 className="h-4 w-4" /> confirmed · 4f9c…a21b
              </div>
            </div>
          </div>
        </motion.div>
        <div>
          <SectionHeader
            kicker="Built on Stellar"
            title="Using Stellar for exactly what it's best at"
            align="left"
          />
          <ul className="mt-6 space-y-3">
            {points.map((p, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="flex items-start gap-3"
              >
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-grape">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="#fff">
                    <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" />
                  </svg>
                </span>
                <span className="text-ink/80">{p}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function DemoFlow() {
  const flow = [
    "Sign in with Stellar wallet",
    "Create a group",
    "Add a shared expense",
    "See each person's share",
    "Settle through Stellar",
    "View tx hash & memo",
  ];
  return (
    <section className="grid-bg border-y-3 border-ink py-16">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeader kicker="The demo" title="Watch Stellar do real work" />
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {flow.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="rounded-xl border-3 border-ink bg-cream px-4 py-2 font-display text-xs uppercase tracking-wide shadow-brutal"
              >
                <span className="text-grape">{i + 1}.</span> {step}
              </motion.span>
              {i < flow.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 text-ink/40 sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-3xl border-3 border-ink bg-grape px-8 py-16 text-center shadow-brutal-xl"
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rotate-12 rounded-3xl border-3 border-ink bg-lime/30" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 -rotate-12 rounded-full border-3 border-ink bg-tangerine/30" />
        <h2 className="relative font-display text-4xl uppercase tracking-tight text-white md:text-5xl">
          Stop chasing IOUs.
        </h2>
        <p className="relative mx-auto mt-4 max-w-md text-grape-pale">
          Split the bill, settle on Stellar, and keep a receipt everyone can
          verify. Free and open source.
        </p>
        <Link href="/login" className="relative mt-8 inline-block">
          <Button size="lg" variant="lime">
            <Wallet className="h-5 w-5" /> Launch Mergepay
          </Button>
        </Link>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t-3 border-ink bg-ink py-10 text-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 md:flex-row">
        <Logo className="[&_span]:text-paper [&_.text-grape]:text-grape-light" />
        <p className="max-w-sm text-center text-xs text-paper/60 md:text-left">
          Mergepay is a Stellar-native group settlement app. Open-source public
          good — built for friends, roommates, and small communities.
        </p>
        <div className="flex items-center gap-4 font-display text-xs uppercase tracking-widest">
          <a
            href="https://github.com/Cjay-Cyber-2/mergepay-web"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-lime transition-colors"
          >
            <Github className="h-4 w-4" /> Web
          </a>
          <a
            href="https://github.com/Cjay-Cyber-2/mergepay-api"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-lime transition-colors"
          >
            <Github className="h-4 w-4" /> API
          </a>
        </div>
      </div>
    </footer>
  );
}

function SectionHeader({
  kicker,
  title,
  align = "center",
}: {
  kicker: string;
  title: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <span className="inline-block rounded-lg border-2 border-ink bg-butter px-3 py-1 font-display text-xs uppercase tracking-widest shadow-brutal-sm">
        {kicker}
      </span>
      <h2
        className={`mt-4 font-display text-3xl uppercase leading-tight tracking-tight md:text-4xl ${
          align === "center" ? "mx-auto max-w-2xl" : "max-w-md"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}
