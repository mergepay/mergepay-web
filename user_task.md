# Mergepay — Human Tasks to Reach Full Production

Everything that is **code** is done and pushed across the two repos in the
**mergepay** GitHub organization:

- **Frontend:** https://github.com/mergepay/mergepay-web (this repo)
- **Backend:** https://github.com/mergepay/mergepay-api

The app builds cleanly, the API test suite passes (33 tests), and there are **no
mocks in the running app** — every Stellar action goes through real SEP-10, real
Horizon submission, real SEP-24 anchor calls. (Mocks exist *only* inside the
backend's automated tests, which is correct and expected.)

> **The app is configured for MAINNET (the Stellar public network) by default.**
> No code switch is needed — `STELLAR_NETWORK=public`, mainnet Horizon, and Circle's
> mainnet USDC issuer are the built-in defaults. You only fill in the human pieces
> below (wallet funded with real XLM, database, secrets, deploy). If you ever want a
> zero-cost dry run first, see **Appendix A** for the testnet overrides.

What remains is the human / ops work that code cannot do for you: getting accounts,
keys, a database, and pressing deploy. This document lists **every** such step.

---

## 0. Infrastructure overview — your three services

```
 Browser ── Freighter wallet
    │
    ▼
 mergepay-web  ──HTTPS──▶  mergepay-api  ──▶  Neon Postgres
  (Vercel)                  (Render)            (serverless PG)
                                │
                                ├──▶ Stellar Horizon (MAINNET: horizon.stellar.org)
                                └──▶ SEP-24 Anchor (your production anchor)
```

| Repo | Role | Host | Why |
|---|---|---|---|
| **mergepay-web** | Next.js frontend | **Vercel** | Zero-config Next.js, free tier, instant CDN |
| **mergepay-api** | Fastify API + worker | **Render** | Long-running Node server; supports background workers |
| Database | PostgreSQL | **Neon** | Serverless Postgres, free tier, instant provisioning |

**Deploy order: Neon → Render → Vercel** (each step feeds the next its URL/credentials).

---

## 1. Install a Stellar wallet (MAINNET)

1. Install **Freighter** browser extension: https://www.freighter.app/
2. Create an account; leave the network on **Mainnet / Public** (Freighter's default).
3. **Fund it with real XLM.** There is no Friendbot on mainnet — you must acquire XLM
   (e.g. buy on an exchange like Coinbase/Kraken/Binance and withdraw to your Freighter
   public key, or use Freighter's built-in on-ramp). Each account needs at least a few
   XLM to cover the ~1 XLM base reserve + fees.
4. **Add a USDC trustline** if you'll settle in USDC: Freighter → Manage Assets →
   Add Asset → search `USDC` (issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`,
   Circle). XLM needs no trustline.
5. Every person who settles a share needs their own funded mainnet account (settling
   sends a real on-chain payment).

> Mergepay never sees or stores your secret key. Freighter signs everything locally.
>
> ⚠️ **Mainnet uses real money.** If you want to rehearse risk-free first, follow
> **Appendix A** to flip both deploys to testnet, then come back here for mainnet.

---

## 2. Provision the database — Neon (PostgreSQL)

1. Go to https://neon.tech and sign up (free, no credit card needed for the free tier).
2. Click **New Project** → name it `mergepay` → choose the region closest to your Render region (e.g. US East).
3. Once created, go to **Connection Details** and copy the **Connection string** — it looks like:
   ```
   postgresql://USER:PASSWORD@ep-XXXX.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Save this string — it becomes `DATABASE_URL` for the API.
5. **You do not need to create any tables.** Prisma migrations will do that automatically when the API first starts (see §4).

> Neon's free tier gives you 0.5 GB storage and auto-pauses the database when idle (it wakes in ~1 s). This is perfect for testnet demos. For production mainnet traffic, upgrade to the Launch plan ($19/mo).

---

## 3. Generate backend secrets (run locally once)

In the **mergepay-api** repo, run these in your terminal:

```bash
cd mergepay-api
npm install

# 1) SEP-10 server signing keypair — prints: SEP10_SIGNING_SECRET=S...
npm run gen:sep10key

# 2) JWT signing secret — any 48+ byte random hex string
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3) Anchor webhook secret — any random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy each output value. You will paste them into Render's environment variables in §4.

**Important:** The SEP-10 signing key does NOT need to be funded on Stellar — it only signs login challenges. Keep its secret key (`S...`) private. Never commit it to git.

---

## 4. Deploy the backend — Render

### 4a. Create the Web Service

1. Go to https://render.com → sign up / log in.
2. Click **New → Web Service** → **Connect a repository** → select `mergepay/mergepay-api`.
3. Settings:
   - **Name:** `mergepay-api`
   - **Region:** US East (Ohio) — matches Neon's region for lowest latency
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build command:** `npm install && npm run prisma:generate && npm run build`
   - **Start command:** `npm run prisma:deploy && npm run start`
   - **Plan:** Free (for demo) or Starter $7/mo (for always-on)

4. Click **Advanced** → **Add Environment Variable** and add every variable from the table below.

### 4b. Environment variables for the API

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string from §2 |
| `JWT_SECRET` | 48-byte hex from §3 |
| `STELLAR_NETWORK` | `public` (mainnet) |
| `HORIZON_URL` | `https://horizon.stellar.org` |
| `SEP10_SIGNING_SECRET` | `S...` key from `npm run gen:sep10key` |
| `SEP10_HOME_DOMAIN` | `mergepay-api.onrender.com` (your Render domain — set after first deploy) |
| `WEB_AUTH_DOMAIN` | Same as `SEP10_HOME_DOMAIN` |
| `API_PUBLIC_URL` | `https://mergepay-api.onrender.com` |
| `WEB_URL` | Your Vercel URL (set after §5 — come back and fill this in) |
| `ANCHOR_HOME_DOMAIN` | Your production anchor's domain (only if you offer fiat on/off-ramp — see §8). Leave blank to disable SEP-24. |
| `ANCHOR_NAME` | Your anchor's display name (only if using an anchor) |
| `ANCHOR_WEBHOOK_SECRET` | Random string from §3 |
| `STABLE_ASSET_CODE` | `USDC` |
| `STABLE_ASSET_ISSUER` | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` (Circle mainnet USDC) |
| `UPLOADS_DIR` | `./uploads` |
| `NODE_ENV` | `production` |

5. Click **Create Web Service**. Render will build and deploy. First deploy takes ~3–5 minutes.
6. Once deployed, copy your Render URL (e.g. `https://mergepay-api.onrender.com`). You need it for the web deploy in §5.
7. **Test it:** open `https://mergepay-api.onrender.com/health` in a browser — it should return `{"status":"ok"}`.

### 4c. Health check

In the Render service settings, set:
- **Health Check Path:** `/health`

This lets Render know the service is alive and restarts it automatically if it hangs.

### 4d. Background worker (optional, recommended)

The worker reconciles pending settlements and polls anchor transfer status.

1. In Render, click **New → Background Worker** → connect the same `mergepay/mergepay-api` repo.
2. Settings:
   - **Name:** `mergepay-worker`
   - **Build command:** `npm install && npm run prisma:generate && npm run build`
   - **Start command:** `npm run worker:start`
3. Add the **exact same environment variables** as the web service (copy-paste them).

### 4e. Receipt upload persistence

Render's filesystem is **ephemeral** — files in `./uploads` are lost on redeploy. For a testnet demo this is fine. For production, either:
- Attach a **Render Disk** (paid): Settings → Disks → mount at `/opt/render/project/uploads`
- Or migrate uploads to Cloudflare R2 / AWS S3 later (change `UPLOADS_DIR` and wire up the S3 SDK).

---

## 5. Deploy the frontend — Vercel

### 5a. Import the project

1. Go to https://vercel.com → **Add New Project** → **Import Git Repository** → select `mergepay/mergepay-web`.
2. Framework preset: **Next.js** (auto-detected — no changes needed).
3. Click **Environment Variables** and add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://mergepay-api.onrender.com` (your Render URL from §4) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `public` (mainnet) |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon.stellar.org` |
| `NEXT_PUBLIC_STABLE_ASSET_CODE` | `USDC` |
| `NEXT_PUBLIC_STABLE_ASSET_ISSUER` | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` (Circle mainnet USDC) |

> These mainnet values are also the **built-in code defaults**, so the app works on
> mainnet even if you forget a variable. Setting them explicitly is still best practice.

4. Click **Deploy**. Vercel builds and deploys in ~2 minutes.
5. Copy your Vercel URL (e.g. `https://mergepay-web.vercel.app`).

### 5b. Wire up CORS — critical step

1. Go back to your **Render** service → **Environment** tab.
2. Set `WEB_URL` = `https://mergepay-web.vercel.app` (your Vercel URL).
3. Set `SEP10_HOME_DOMAIN` = `mergepay-api.onrender.com` (without `https://`).
4. Set `WEB_AUTH_DOMAIN` = same as `SEP10_HOME_DOMAIN`.
5. Click **Save Changes** — Render auto-redeploys.

Without this step the browser will get CORS errors on login.

---

## 6. End-to-end smoke test

Once both are deployed:

1. Open your Vercel URL in a browser with Freighter installed.
2. Click **Connect Freighter** on the login page.
3. Freighter prompts you to sign a SEP-10 challenge — approve it.
4. You're logged in. Create a group → add an expense → settle it.
5. After signing in Freighter and the transaction confirms, you'll see a real Stellar transaction hash. Click it — it opens on the Stellar Expert **mainnet** explorer (real on-chain payment).

If anything fails, check the Render logs: Render dashboard → your service → **Logs** tab.

---

## 7. Mainnet readiness checklist (you are already on mainnet)

The code defaults to mainnet, so there's no network switch to flip. Just make sure
these real-money prerequisites are handled:

1. **Funding:** every account (yours + each member who settles) holds real XLM, and a
   USDC trustline if settling in USDC (§1). No Friendbot exists on mainnet.
2. **Treasury accounts** (for the multisig/treasury feature) are created and funded in
   your wallet, then registered in-app. The API never holds their keys.
3. **Database:** for sustained mainnet traffic, upgrade Neon to the Launch plan for
   production-grade connection pooling (the free tier auto-pauses when idle).
4. **Secrets:** confirm `JWT_SECRET`, `SEP10_SIGNING_SECRET`, and `ANCHOR_WEBHOOK_SECRET`
   are strong random values (not the `change-me` placeholders).
5. **CORS:** `WEB_URL` on the API is set to your exact Vercel/custom domain (not `*`).

---

## 8. Anchor (SEP-24 fiat on/off-ramp) notes

- SEP-24 is **optional** — Mergepay works fully without it (members fund their own
  wallets). The on/off-ramp is only needed if you want users to cash in/out to fiat.
- There is **no free public anchor on mainnet.** To enable fiat, partner with a
  production anchor (MoneyGram Access, Vibrant, or a regional anchor), complete their
  KYC/business onboarding, and set `ANCHOR_HOME_DOMAIN` + `ANCHOR_NAME` to theirs. The
  code already speaks standard SEP-24.
- Leave `ANCHOR_HOME_DOMAIN` **blank** to disable the ramp cleanly.
- If the anchor sends webhooks, point them at `POST /anchors/webhook` with header
  `x-anchor-signature: <ANCHOR_WEBHOOK_SECRET>`.
- *(Testnet only:* `testanchor.stellar.org` / `ANCHOR_NAME="Stellar Test Anchor"` is the
  free SDF sandbox anchor — see Appendix A.)*

---

## 9. Custom domains (optional, recommended for grant demos)

### Vercel custom domain
1. Vercel → Project → **Settings → Domains** → Add `app.mergepay.xyz`.
2. Add the DNS record your domain registrar asks for (CNAME or A record).
3. After DNS propagates, update `NEXT_PUBLIC_API_URL` if needed and redeploy.

### Render custom domain
1. Render → Service → **Settings → Custom Domains** → Add `api.mergepay.xyz`.
2. Add the CNAME record at your registrar pointing to the Render endpoint.
3. After adding, update on the API side:
   - `API_PUBLIC_URL=https://api.mergepay.xyz`
   - `SEP10_HOME_DOMAIN=api.mergepay.xyz`
   - `WEB_AUTH_DOMAIN=api.mergepay.xyz`
   - `WEB_URL=https://app.mergepay.xyz`
4. Save and redeploy the API.

---

## 10. Polish for Drips / Stellar Community Fund / GrantFox submission

These are content tasks (no code):

1. **Screenshots/GIF:** capture 3–5 screenshots (landing, group creation, expense, settle + tx hash, history) and a short GIF of a full settlement flow. Drop in `mergepay-web/screenshots/` and embed in the README under a "Screenshots" section.
2. **Live links:** paste your Vercel URL and a sample mainnet tx hash under "Demo" in both READMEs.
3. **Impact metrics:** add targets (e.g. "1,000 funded wallets, $X settled, N active groups").
4. **Demo access:** the app uses wallet login — note "Install Freighter, fund with XLM (+ USDC trustline)" as the setup step for reviewers. If you'd rather give reviewers a zero-cost path, deploy a second testnet instance per Appendix A.
5. Confirm repos are **public** and `MIT LICENSE` is present (it is).

---

## 11. Local development

```bash
# --- API ---
cd mergepay-api
npm install
cp .env.example .env
# Fill in: DATABASE_URL (Neon URL), run `npm run gen:sep10key`, set JWT_SECRET
npm run prisma:generate
npm run prisma:migrate          # needs Neon DATABASE_URL in .env
npm run db:seed                 # optional demo data
npm run dev                     # http://localhost:4000
npm run worker                  # (separate shell) background jobs

# --- Web ---
cd ../mergepay-web
npm install
cp .env.example .env.local
# Set: NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                     # http://localhost:3000
```

---

## Checklist

- [ ] Freighter installed + **mainnet** account funded with real XLM (+ USDC trustline)
- [ ] Neon project created, connection string copied
- [ ] `SEP10_SIGNING_SECRET`, `JWT_SECRET`, `ANCHOR_WEBHOOK_SECRET` generated (no `change-me`)
- [ ] Render Web Service deployed with all env vars (`STELLAR_NETWORK=public`); health check returns `{"status":"ok"}`
- [ ] Render Background Worker deployed (optional but recommended)
- [ ] Vercel project deployed with all `NEXT_PUBLIC_*` env vars (`public` network)
- [ ] `WEB_URL` on Render set to Vercel URL → Render redeployed (CORS fix)
- [ ] `SEP10_HOME_DOMAIN` and `WEB_AUTH_DOMAIN` set to Render domain (no `https://`)
- [ ] End-to-end test: login → create group → add expense → settle → see tx hash → tx on Stellar Explorer (mainnet)
- [ ] Screenshots/GIF + live links + metrics added to READMEs for the grant

---

## Appendix A — Run on TESTNET instead (zero-cost dry run)

The app ships on mainnet. To rehearse with free, fake money first, override these env
vars (everything else stays the same). Nothing in the code changes.

**On Render (API):**

| Variable | Testnet value |
|---|---|
| `STELLAR_NETWORK` | `testnet` |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `STABLE_ASSET_ISSUER` | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| `ANCHOR_HOME_DOMAIN` | `testanchor.stellar.org` |
| `ANCHOR_NAME` | `Stellar Test Anchor` |

**On Vercel (web):**

| Variable | Testnet value |
|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_STABLE_ASSET_ISSUER` | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |

**Then on testnet:**
1. In Freighter, switch the network to **Testnet** (Settings → Network → Testnet).
2. Fund each account for free with **Friendbot**: open
   `https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY`, or use https://lab.stellar.org/.
3. The SDF test anchor (`testanchor.stellar.org`) provides a free SEP-24 sandbox.

When you're done testing, remove these overrides (or set them back to the mainnet values
in §4/§5) and redeploy — you're back on mainnet.
