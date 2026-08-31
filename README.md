<div align="center">

# Mergepay — Web

**Split expenses on Stellar, settle instantly, track everything transparently.**

Mergepay is a Stellar-native group settlement app that turns shared spending into
transparent, auditable, low-fee on-chain payments for friends, roommates, trips,
and small communities.

[Web repo](https://github.com/mergepay/mergepay-web) ·
[API repo](https://github.com/mergepay/mergepay-api)

![CI](https://github.com/mergepay/mergepay-web/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/github/license/mergepay/mergepay-web)
![Vercel](https://img.shields.io/badge/deployed-vercel-black)

</div>

---

This is the **frontend** — a Next.js 14 app with a bold neobrutalist design system.
It handles wallet login (SEP-10 via Freighter), group & expense management, on-chain
settlement, treasury mode, anchor on/off-ramp, and transparent history. All business
logic and Stellar submission live in [`mergepay-api`](https://github.com/mergepay/mergepay-api).

> **Built on Stellar.** Login is SEP-10 wallet auth, settlements are real on-chain
> Stellar payments (with a `MP:<code>` memo per expense), balances clear in XLM or
> USDC over trustlines, and fiat on/off-ramp uses SEP-24 anchors. Keys never leave the
> user's wallet.

## Why Stellar

Mergepay uses Stellar for exactly what it is best at — moving value cheaply, quickly,
and verifiably:

- **SEP-10** wallet authentication — your public key is your identity.
- **Payments & path payments** settle instantly.

## Running E2E Tests Locally

To run the end-to-end test suite using Playwright:

1. Install Playwright browsers (first-time setup):
   ```bash
   npx playwright install
   ```
2. Run the E2E test command:
   ```bash
   npm run test:e2e
   ```
