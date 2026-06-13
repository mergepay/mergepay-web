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

## 0. Infrastructure overview — your three services

```
 Browser ── Freighter wallet
    │
    ▼
 mergepay-web  ──HTTPS──▶  mergepay-api  ──▶  Neon Postgres
  (Vercel)                  (Render)            (serverless PG)
                                │
                                ├──▶ Stellar Horizon (testnet/public)
                                └──▶ SEP-24 Anchor (testanchor.stellar.org)
```

| Repo | Role | Host | Why |
|---|---|---|---|
| **mergepay-web** | Next.js frontend | **Vercel** | Zero-config Next.js, free tier, instant CDN |
| **mergepay-api** | Fastify API + worker | **Render** | Long-running Node server; supports background workers |
| Database | PostgreSQL | **Neon** | Serverless Postgres, free tier, instant provisioning |

**Deploy order: Neon → Render → Vercel** (each step feeds the next its URL/credentials).

---

## 1. Install a Stellar wallet

1. Install **Freighter** browser extension: https://www.freighter.app/
2. Create an account; switch network to **Testnet** (Freighter → Settings → Network → Testnet).
3. Fund it via **Friendbot**: open `https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY` in a browser, or use https://lab.stellar.org/ → Account → Fund.
4. Every person who settles a share needs their own funded testnet account.

> Mergepay never sees or stores your secret key. Freighter signs everything locally.

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
2. Click **New → Web Service** → **Connect a repository** → select `Cjay-Cyber-2/mergepay-api`.
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
| `STELLAR_NETWORK` | `testnet` |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `SEP10_SIGNING_SECRET` | `S...` key from `npm run gen:sep10key` |
| `SEP10_HOME_DOMAIN` | `mergepay-api.onrender.com` (your Render domain — set after first deploy) |
| `WEB_AUTH_DOMAIN` | Same as `SEP10_HOME_DOMAIN` |
| `API_PUBLIC_URL` | `https://mergepay-api.onrender.com` |
| `WEB_URL` | Your Vercel URL (set after §5 — come back and fill this in) |
| `ANCHOR_HOME_DOMAIN` | `testanchor.stellar.org` |
| `ANCHOR_NAME` | `Stellar Test Anchor` |
| `ANCHOR_WEBHOOK_SECRET` | Random string from §3 |
| `STABLE_ASSET_CODE` | `USDC` |
| `STABLE_ASSET_ISSUER` | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
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

1. In Render, click **New → Background Worker** → connect the same `mergepay-api` repo.
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

1. Go to https://vercel.com → **Add New Project** → **Import Git Repository** → select `Cjay-Cyber-2/mergepay-web`.
2. Framework preset: **Next.js** (auto-detected — no changes needed).
3. Click **Environment Variables** and add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://mergepay-api.onrender.com` (your Render URL from §4) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_STABLE_ASSET_CODE` | `USDC` |
| `NEXT_PUBLIC_STABLE_ASSET_ISSUER` | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |

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
5. After signing in Freighter and the transaction confirms, you'll see a real Stellar transaction hash. Click it — it opens on Stellar Expert testnet explorer.

If anything fails, check the Render logs: Render dashboard → your service → **Logs** tab.

---

## 7. Going to MAINNET (only when ready for real money)

1. On **both** repos change `STELLAR_NETWORK=public` and `HORIZON_URL=https://horizon.stellar.org`.
2. Replace the stable asset issuer with Circle's mainnet USDC:
   - `STABLE_ASSET_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
   - Update both `STABLE_ASSET_ISSUER` (API) and `NEXT_PUBLIC_STABLE_ASSET_ISSUER` (web).
3. Each user must add a **USDC trustline** in Freighter: Freighter → Manage Assets → Add Asset → USDC (Circle issuer above).
4. Mainnet accounts must be funded with **real XLM** — no Friendbot on mainnet.
5. Treasury accounts are created in your wallet then registered in-app. The API never holds their keys.
6. Neon: upgrade to Launch plan for production-grade connection pooling.

---

## 8. Anchor (SEP-24 fiat on/off-ramp) notes

- Out of the box the API points at **SDF Stellar Test Anchor** (`testanchor.stellar.org`) — works on testnet with no sign-up.
- For real fiat on mainnet, partner with a production anchor (MoneyGram Access, Vibrant, or a regional anchor) and set `ANCHOR_HOME_DOMAIN` to their domain. The code already speaks standard SEP-24.
- If the anchor sends webhooks, point them at `POST /anchors/webhook` with header `x-anchor-signature: <ANCHOR_WEBHOOK_SECRET>`.

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
2. **Live links:** paste your Vercel URL and a sample testnet tx hash under "Demo" in both READMEs.
3. **Impact metrics:** add targets (e.g. "1,000 funded testnet wallets, $X settled, N active groups").
4. **Demo access:** the app uses wallet login — note "Install Freighter (testnet), fund via Friendbot" as the only setup step for reviewers.
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

- [ ] Freighter installed + testnet account funded via Friendbot
- [ ] Neon project created, connection string copied
- [ ] `SEP10_SIGNING_SECRET`, `JWT_SECRET`, `ANCHOR_WEBHOOK_SECRET` generated
- [ ] Render Web Service deployed with all env vars; health check returns `{"status":"ok"}`
- [ ] Render Background Worker deployed (optional but recommended)
- [ ] Vercel project deployed with all `NEXT_PUBLIC_*` env vars
- [ ] `WEB_URL` on Render set to Vercel URL → Render redeployed (CORS fix)
- [ ] `SEP10_HOME_DOMAIN` and `WEB_AUTH_DOMAIN` set to Render domain (no `https://`)
- [ ] End-to-end test: login → create group → add expense → settle → see tx hash → tx on Stellar Explorer
- [ ] (Mainnet) network flipped, Circle USDC issuer set, USDC trustlines added, real XLM funded
- [ ] Screenshots/GIF + live links + metrics added to READMEs for the grant
