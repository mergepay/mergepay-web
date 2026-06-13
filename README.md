<div align="center">

# Mergepay — Web

**Split expenses on Stellar, settle instantly, track everything transparently.**

Mergepay is a Stellar-native group settlement app that turns shared spending into
transparent, auditable, low-fee on-chain payments for friends, roommates, trips,
and small communities.

[Web repo](https://github.com/Cjay-Cyber-2/mergepay-web) ·
[API repo](https://github.com/Cjay-Cyber-2/mergepay-api)

</div>

---

This is the **frontend** — a Next.js 14 app with a bold neobrutalist design system.
It handles wallet login (SEP-10 via Freighter), group & expense management, on-chain
settlement, treasury mode, anchor on/off-ramp, and transparent history. All business
logic and Stellar submission live in [`mergepay-api`](https://github.com/Cjay-Cyber-2/mergepay-api).

## Why Stellar

Mergepay uses Stellar for exactly what it is best at — moving value cheaply, quickly,
and verifiably:

- **SEP-10** wallet authentication — your public key is your identity.
- **Payments & path payments** settle balances in seconds, in XLM or a stable asset.
- **Trustlines** unlock stablecoin support alongside native XLM.
- **Memos** bind every payment to a specific expense for a clean audit trail.
- **Multisig** accounts secure shared group treasuries.
- **SEP-24** anchors bridge fiat and Stellar without leaving the app.

The wallet always holds the keys; Mergepay only ever builds transactions for the user
to sign. Every settlement shows its transaction hash, linking the in-app ledger to the
public Stellar ledger.

## Screens

| Route | What it does |
| --- | --- |
| `/` | Marketing landing page with animated Lottie illustrations |
| `/login` | SEP-10 wallet sign-in (Freighter) |
| `/dashboard` | Balances summary + your groups |
| `/groups` · `/groups/[id]` | Group list and detail (Expenses, Balances, Ledger, Treasury, Members tabs) |
| `/join/[code]` | Accept an invite link |
| `/anchors` | SEP-24 deposit / withdrawal flows |
| `/history` | Cross-group expense & settlement history, CSV / PDF export |
| `/settings` | Profile + Stellar identity |

## Prerequisites

- Node.js 20+ and npm
- A running [`mergepay-api`](https://github.com/Cjay-Cyber-2/mergepay-api) instance
- [Freighter](https://www.freighter.app/) wallet browser extension (testnet account funded via [friendbot](https://friendbot.stellar.org))

## Installation

```bash
git clone https://github.com/Cjay-Cyber-2/mergepay-web.git
cd mergepay-web
npm install
cp .env.example .env.local   # then edit values
npm run dev                  # http://localhost:3000
```

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of mergepay-api | `http://localhost:4000` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `public` | `testnet` |
| `NEXT_PUBLIC_HORIZON_URL` | Horizon server URL | testnet Horizon |
| `NEXT_PUBLIC_STABLE_ASSET_CODE` | Stable asset offered for settlement | `USDC` |
| `NEXT_PUBLIC_STABLE_ASSET_ISSUER` | Issuer of the stable asset | SDF test USDC |

## How the flows work

### SEP-10 login
1. The app reads your active public key from Freighter.
2. It asks the API for a SEP-10 **challenge transaction** for that account.
3. Freighter signs the challenge; the API verifies the signature and issues a JWT.
4. The JWT is stored client-side and sent as a `Bearer` token on every request.

### Settlement
1. You pick a share/suggestion to settle.
2. The API builds an **unsigned payment XDR** (correct asset, amount, destination, and a `MP:<code>` memo linking it to the expense).
3. Freighter signs it; the API validates the signed XDR matches the intent, submits to Stellar, stores the transaction hash, and marks the share settled.
4. The ledger updates with a clickable [stellar.expert](https://stellar.expert) link.

### Treasury mode
A group can register a dedicated Stellar account (created in the wallet — the API never
holds its key). Deposits are signed by members; withdrawals are signed from the treasury
account and can require multiple signers (multisig) before submission.

### Anchor deposits (SEP-24)
The app starts a session, the API fetches a SEP-10 challenge **from the anchor**, the
wallet signs it, and the API exchanges it for the anchor's interactive deposit/withdraw
URL, which opens in a new tab.

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · TanStack Query · Zustand ·
Framer Motion · Freighter API · LottieFiles · Zod.

## Design system

Neobrutalist: thick `#18130E` ink borders, hard offset shadows, a grape/lime/tangerine/
flamingo palette on warm paper, Archivo Black display + Space Grotesk body + IBM Plex Mono.
Primitives live in [src/components/ui/](src/components/ui/).

## Project structure

```
src/
  app/                 # routes (App Router)
    (app)/             # authenticated shell + pages
  components/          # UI primitives + feature components
  lib/                 # api client, types (contract), stellar, queries, utils
```

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Deployment

Deploys cleanly to **Vercel** — set the `NEXT_PUBLIC_*` env vars in the project
settings and point `NEXT_PUBLIC_API_URL` at your deployed API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Mergepay is an open-source public good — issues
and PRs welcome.

## License

[MIT](LICENSE) © 2026 Mergepay contributors.
