# Mergepay — Human Tasks to Reach Full Production

Everything that is **code** is done and pushed across the two repos:

- **Frontend:** https://github.com/Cjay-Cyber-2/mergepay-web (this repo)
- **Backend:** https://github.com/Cjay-Cyber-2/mergepay-api

The app builds cleanly, the API test suite passes (33 tests), and there are **no
mocks in the running app** — every Stellar action goes through real SEP-10, real
Horizon submission, real SEP-24 anchor calls. (Mocks exist *only* inside the
backend's automated tests, which is correct and expected.)

What remains is the human / ops work that code cannot do for you: getting accounts,
keys, a database, and pressing deploy. This document lists **every** such step.

---

## 0. Quick answer to your hosting question

> **"What repo do I host as the frontend — the web or the api repo?"**

Two **separate** deploys:

| Repo | Role | Where to host | Why |
| --- | --- | --- | --- |
| **mergepay-web** (this one) | Frontend (Next.js) | **Vercel** | Built for Next.js; zero-config, free tier, instant. |
| **mergepay-api** | Backend (Fastify + Postgres + worker) | **Render** (or Railway / Fly.io) | Long-running Node server + a background worker + needs a database. Vercel's serverless model is **not** suitable for the API/worker. |

So: **web → Vercel, api → Render**, plus a **Postgres database** (Neon or Supabase).
They talk to each other over HTTPS — the web app calls the API via
`NEXT_PUBLIC_API_URL`, and the API allows the web origin via `WEB_URL` (CORS).

```
 Browser ── Freighter wallet
    │
    ▼
 mergepay-web  (Vercel)   ──HTTPS──▶  mergepay-api (Render) ──▶ Postgres (Neon)
                                            │
                                            ├──▶ Stellar Horizon (testnet/public)
                                            └──▶ SEP-24 Anchor (testanchor.stellar.org)
```

---

## 1. Install a Stellar wallet (required to use the app at all)

1. Install the **Freighter** browser extension: https://www.freighter.app/
2. Create/import an account and **switch the network to Testnet** (Freighter → Settings → Network → Testnet) while you are demoing on testnet.
3. Fund the testnet account with free XLM using **Friendbot**:
   - Easiest: open `https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY` in a browser, or
   - Use the Stellar Lab: https://lab.stellar.org/ → Account → Fund.
   - Every person who will settle a share needs a funded account (settling sends a real payment, which requires the account to exist on-chain).

> Mergepay never sees or stores your secret key. Freighter signs everything.

---

## 2. Provision a PostgreSQL database (for the API)

Pick one (all have free tiers):

- **Neon** — https://neon.tech (recommended; serverless Postgres)
- **Supabase** — https://supabase.com (Database → Connection string)
- **Render Postgres** — create it inside Render alongside the API

You will get a connection string like:
```
postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```
Save it — it becomes `DATABASE_URL` for the API. After deploying the API, run the
migration once (see §4): `npm run prisma:deploy`.

---

## 3. Generate the backend secrets (no third-party signup needed)

In the **mergepay-api** repo, run these locally once:

```bash
cd mergepay-api
npm install

# 1) SEP-10 server signing key (prints SEP10_SIGNING_SECRET=S...)
npm run gen:sep10key

# 2) A JWT signing secret — any long random string, e.g.
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

- The **SEP-10 signing key** does NOT need to be funded — it only signs login challenges. Keep its secret private.
- Use the JWT output as `JWT_SECRET`.
- Set a random string for `ANCHOR_WEBHOOK_SECRET` too.

---

## 4. Deploy the backend (mergepay-api) on Render

1. Go to https://render.com → **New → Web Service** → connect the `mergepay-api` repo.
2. Settings:
   - **Build command:** `npm install && npm run prisma:generate && npm run build`
   - **Start command:** `npm run prisma:deploy && npm run start`
   - **Health check path:** `/health`
3. Add the environment variables (from `.env.example`):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | your Postgres URL from §2 |
   | `JWT_SECRET` | random string from §3 |
   | `STELLAR_NETWORK` | `testnet` (or `public` for mainnet) |
   | `HORIZON_URL` | `https://horizon-testnet.stellar.org` (mainnet: `https://horizon.stellar.org`) |
   | `SEP10_SIGNING_SECRET` | from §3 |
   | `SEP10_HOME_DOMAIN` | your API domain, e.g. `mergepay-api.onrender.com` |
   | `WEB_AUTH_DOMAIN` | same as `SEP10_HOME_DOMAIN` |
   | `API_PUBLIC_URL` | `https://mergepay-api.onrender.com` |
   | `WEB_URL` | your Vercel URL, e.g. `https://mergepay-web.vercel.app` (CORS + invite links) |
   | `ANCHOR_HOME_DOMAIN` | `testanchor.stellar.org` |
   | `ANCHOR_NAME` | `Stellar Test Anchor` |
   | `ANCHOR_WEBHOOK_SECRET` | random string from §3 |
   | `STABLE_ASSET_CODE` | `USDC` |
   | `STABLE_ASSET_ISSUER` | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (SDF testnet USDC) |
   | `UPLOADS_DIR` | `./uploads` (or attach a Render Disk for persistence) |

4. **Background worker** (settlement + anchor reconciliation): add a **second**
   Render service of type **Background Worker** from the same repo with start
   command `npm run worker:start` and the **same env vars**. (Optional but
   recommended — it confirms any settlements that were submitted but not yet
   finalized, and polls anchor transfer status.)

5. **Receipt uploads note:** Render's filesystem is ephemeral. For persistent
   receipt images either attach a **Render Disk** mounted at `./uploads`, or
   migrate uploads to S3/Cloudflare R2 later. For a demo, the ephemeral disk is fine.

---

## 5. Deploy the frontend (mergepay-web) on Vercel

1. Go to https://vercel.com → **Add New → Project** → import `mergepay-web`.
2. Framework preset: **Next.js** (auto-detected). No build overrides needed.
3. Environment variables (Project → Settings → Environment Variables):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | your Render API URL, e.g. `https://mergepay-api.onrender.com` |
   | `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` (or `public`) |
   | `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
   | `NEXT_PUBLIC_STABLE_ASSET_CODE` | `USDC` |
   | `NEXT_PUBLIC_STABLE_ASSET_ISSUER` | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |

4. Deploy. Then go back to Render and set the API's `WEB_URL` to the Vercel URL so
   CORS and invite links point at the real frontend. Redeploy the API.

> **Order matters:** deploy the API first to get its URL, set it as
> `NEXT_PUBLIC_API_URL` on Vercel, deploy the web, then set `WEB_URL` on the API.

---

## 6. Going to MAINNET (only when you're ready for real money)

1. On **both** repos flip `STELLAR_NETWORK=public` and set Horizon to
   `https://horizon.stellar.org`.
2. Replace the stable asset issuer with the **mainnet USDC issuer**
   (Circle's USDC on Stellar): `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`.
   Update `STABLE_ASSET_ISSUER` (API) and `NEXT_PUBLIC_STABLE_ASSET_ISSUER` (web).
3. Each user must add a **trustline** to USDC in their wallet before they can hold/receive it (Freighter → Manage Assets → add USDC). XLM needs no trustline.
4. Mainnet accounts must be funded with **real XLM** (there is no Friendbot on mainnet).
5. Treasury accounts must be created and funded by you in a wallet, then registered in-app (the API never holds their keys).

---

## 7. Anchor (SEP-24 fiat on/off-ramp) notes

- Out of the box the API points at the **SDF Stellar Test Anchor**
  (`testanchor.stellar.org`), which works on testnet with no signup.
- For a **real fiat ramp on mainnet**, partner with a production anchor (e.g.
  MoneyGram Access, Vibrant, or a regional anchor) and set `ANCHOR_HOME_DOMAIN`
  to their domain. Some anchors require KYC/business onboarding — that's a
  business step on your side, the code already speaks standard SEP-24.
- If your anchor sends status webhooks, point them at `POST /anchors/webhook`
  with the header `x-anchor-signature: <ANCHOR_WEBHOOK_SECRET>`.

---

## 8. Custom domains (optional, recommended for a grant demo)

- Vercel: Project → Settings → Domains → add `app.mergepay.xyz` (or similar).
- Render: Service → Settings → Custom Domain → add `api.mergepay.xyz`.
- After adding domains, update `WEB_URL`, `NEXT_PUBLIC_API_URL`, `API_PUBLIC_URL`,
  `SEP10_HOME_DOMAIN`, and `WEB_AUTH_DOMAIN` to the new hostnames and redeploy.

---

## 9. Polish for the Drips / Stellar Community Fund / GrantFox submission

These are **content** tasks (no code), to maximize review score:

1. **Screenshots / GIF:** run the app, capture 3–5 screenshots (landing, create
   group, add expense, settle + tx hash, history) and a short GIF of a settlement.
   Drop them in `mergepay-web` (e.g. a `/screenshots` folder) and embed them in the
   README under a "Screenshots" heading.
2. **Live demo links:** once deployed, paste the Vercel URL and a sample testnet
   transaction hash (from a real settlement) into both READMEs under "Demo".
3. **Impact metrics:** add your targets to the README grant section (e.g.
   "1,000 funded testnet wallets, $X/mo settled, N active groups").
4. **Demo credentials:** the app uses wallet login, so no username/password —
   just note "Install Freighter (testnet) and fund via Friendbot" in the demo steps.
5. Confirm the repos are **public** and the MIT LICENSE is present (it is).

---

## 10. Local development (for you or contributors)

```bash
# --- API ---
cd mergepay-api
npm install
cp .env.example .env            # fill DATABASE_URL, run `npm run gen:sep10key`, set JWT_SECRET
npm run prisma:generate
npm run prisma:migrate          # needs a running Postgres
npm run db:seed                 # optional demo data
npm run dev                     # API on http://localhost:4000
npm run worker                  # (separate shell) background jobs

# --- Web ---
cd ../mergepay-web
npm install
cp .env.example .env.local      # set NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                     # http://localhost:3000
```

---

## Checklist (tick as you go)

- [ ] Freighter installed + testnet account funded via Friendbot
- [ ] Postgres database created, `DATABASE_URL` copied
- [ ] `SEP10_SIGNING_SECRET`, `JWT_SECRET`, `ANCHOR_WEBHOOK_SECRET` generated
- [ ] API deployed on Render with all env vars; `npm run prisma:deploy` ran
- [ ] Worker service deployed on Render (optional but recommended)
- [ ] Web deployed on Vercel with `NEXT_PUBLIC_*` env vars
- [ ] API `WEB_URL` set to the Vercel URL (CORS) and redeployed
- [ ] End-to-end test: login → create group → add expense → settle → see tx hash
- [ ] (Mainnet) network flipped, USDC issuer + trustlines, real XLM funding
- [ ] Screenshots/GIF + live links + metrics added to READMEs for the grant

That's everything. Once §1–§5 are done you have a fully working, production demo on
testnet. Thanks — enjoy Mergepay! 🚀
