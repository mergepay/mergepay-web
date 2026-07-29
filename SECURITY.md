# Security Policy
# Security Policy

Mergepay-web is the frontend for [Mergepay](https://github.com/mergepay/mergepay-web),
a Stellar-native group settlement app. This document covers the reporting process and
what is considered in scope for **this repository only**. For API/backend issues, use
the security policy in [`mergepay-api`](https://github.com/mergepay/mergepay-api).

## Supported versions

Only the `main` branch is supported. Mergepay is testnet-focused and pre-1.0; there
are no long-term support branches or backports. Security fixes land on `main` and
are picked up by the next Vercel deployment.

| Version | Supported |
| --- | --- |
| `main` (Stellar testnet, and mainnet at your own risk) | Yes |
| Any tagged release before `v1.0.0` | Best effort, no backports |
| Forks / mirrors | No |

## Audit status

Mergepay-web is **unaudited**. It targets Stellar **testnet** by default. Using it
against mainnet is at your own risk — keys never leave your wallet, but the app is
early-stage software and has not been reviewed by a third party.

## In scope

Please report vulnerabilities in any of these areas:

- **Cross-site scripting (XSS)** in expense descriptions, group names, member
  display names, invite metadata, memo strings, or any other user-supplied text
  rendered without sanitization. The session JWT is held **only in memory**
  (see `src/lib/auth-store.ts`) so it cannot be read from `localStorage` or
  `sessionStorage`; however, XSS during an active session can still issue
  authenticated API requests or read the in-memory token from Zustand's store
  before the tab is closed.
- **Invite-link handling** (`/join/[code]`) — code enumeration, open redirects
  when returning from login, auto-accepting or auto-joining a group without an
  explicit user confirmation step, and any UI that could be spoofed to make a
  user think they're joining group A when the code resolves to group B.
- **Client-side token exposure** — anything that widens the XSS blast radius:
  logging the JWT, sending it to a third-party origin, exposing it via
  `postMessage`, leaking it into a URL or referrer, or persisting it to any
  web-readable storage (the token must remain in-memory only).
- **Wallet-connection phishing / transaction spoofing** — any UI path where the
  amount, destination, asset, or memo *displayed* to the user before signing
  does not match what is actually placed in the XDR sent to Freighter. This
  includes settlement flows, treasury withdrawals, and SEP-24 anchor deposits.
- **CSRF on state-changing requests** to the API — including any accidental
  reliance on the browser attaching credentials automatically, or any
  same-origin trust that could be abused.
- **Dependency vulnerabilities** with a demonstrated exploit path in the app
  (a Dependabot alert alone is not enough — please include the call path).

## Out of scope

- **Vulnerabilities in Freighter itself**, or in any other browser wallet
  extension. Report those upstream to
  [`stellar/freighter`](https://github.com/stellar/freighter).
- **Vulnerabilities in `mergepay-api`** (auth, SEP-10 challenge issuance, XDR
  construction, Horizon submission, DB, rate limiting). Please open a report on
  [`mergepay-api`](https://github.com/mergepay/mergepay-api) instead — that repo
  has its own security policy.
- **Vulnerabilities in the Stellar network, Horizon, SDF anchors, or public
  RPC providers.**
- **Testnet-only griefing** where the same behavior on mainnet requires user
  funds and a signed transaction.
- Reports that boil down to "the wallet let me sign a transaction I approved,"
  or "I gave someone my seed phrase."
- Missing security headers, missing SPF/DMARC, or automated scanner output
  without a proof of concept against the deployed app.

## Reporting

**Please do not open a public GitHub Issue for a live vulnerability.**

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/mergepay/mergepay-web/security/advisories/new).

Include:

- A short description of the impact.
- The route(s) or component(s) affected (`src/…` path is ideal).
- A reproduction — minimal HTML, a curl invocation, or a short screencap.
- Whether the issue is testnet-only or also reproduces on mainnet.
- Whether the issue is already public anywhere (previous disclosure, etc.).

We aim to acknowledge new advisories within a few business days. Because the
project has no formal on-call, timelines beyond that are best-effort.

There is no bounty program for this repository. Coordinated disclosure and
credit in release notes are offered by default unless you prefer to remain
anonymous.

<!-- There is no bounty program for this repository. Coordinated disclosure and
credit in release notes are offered by default unless you prefer to remain
anonymous. -->
