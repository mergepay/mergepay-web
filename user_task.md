# Mergepay — How to Get Selected by Drips (Do This Step by Step)

This is your **personal checklist**. Everything in the code is already done. Below are
the only things **you** need to do, in order, with exact click paths. Just follow it
top to bottom.

- Your repos (already under the `mergepay` GitHub org):
  - Backend (apply to Drips with THIS one): https://github.com/mergepay/mergepay-api
  - Frontend: https://github.com/mergepay/mergepay-web
- Your Drips payout address (already added to the code for you):
  `0x39746A9E08B9f7b24b1E1538fBD5e065ee5b2B30`

> **Big picture:** Drips pays open-source maintainers. To get in, you must (1) prove you
> own the repo with an on-chain file, (2) have a public repo with good docs, and (3)
> have a few well-written GitHub Issues for contributors to work on. Items 1 and 2 are
> done. You mainly need to create the **labels** and **issues** (Steps 4 and 5 below).

---

## ✅ Already done for you (no action needed)

- `FUNDING.json` added to both repos **with your address already filled in**.
- `LICENSE` (MIT) present in both repos.
- READMEs explain the Stellar integration and have a 5-minute setup guide.
- `CONTRIBUTING.md` with contributor rules.
- Label definitions and an issue template prepared.
- 6 contributor issues fully written (you'll paste them in Step 5).

---

## STEP 1 — Make both repos Public

A repo must be public for Drips. Do this for **both** repos.

1. Open https://github.com/mergepay/mergepay-api
2. Click **Settings** (top tab, far right).
3. Scroll all the way down to the **Danger Zone**.
4. Find **"Change repository visibility"** → click **Change visibility** → choose **Public** → confirm by typing the repo name.
5. Repeat for https://github.com/mergepay/mergepay-web

> If the page already shows "Public" next to the repo name at the top, it's done — skip it.

---

## STEP 2 — Claim your project on Drips

This links your repo to your MetaMask wallet so Drips knows you own it.

1. Go to **https://app.drips.network**
2. Top-right: **Connect wallet** → choose **MetaMask** → approve in the MetaMask popup.
   - Make sure MetaMask is on the **Ethereum Mainnet** network (it is by default).
3. In the left menu, click **Projects**.
4. Click **Claim project**.
5. Paste your repo URL: `https://github.com/mergepay/mergepay-api`
6. Drips reads your `FUNDING.json`, sees your address `0x3974...2B30`, and confirms it matches your connected wallet. Follow the on-screen prompts to finish.
7. (Optional) Repeat for `https://github.com/mergepay/mergepay-web` if you want both claimed.

> If it says the address doesn't match: make sure the MetaMask account you connected is
> the one with address `0x39746A9E08B9f7b24b1E1538fBD5e065ee5b2B30`.

---

## STEP 3 — Install the Drips "Wave" GitHub App

This lets Drips read your issues and labels.

1. Still in the Drips app, look for **Wave** (or go to the Wave section of the app).
2. In the menu choose **Maintainers → Orgs and Repos**.
3. Click the prompt to **Install the GitHub App**.
4. GitHub will ask which account — choose the **mergepay** organization.
5. When asked for repository access, select **mergepay-api** (and **mergepay-web** if you want), then **Install**. Approve the permissions (issues, labels, pull requests).

---

## STEP 4 — Create the labels (detailed)

Labels are colored tags on issues. Drips uses them to know how hard each task is. You'll
create **4 labels** in the **mergepay-api** repo.

**How to open the labels page:**
1. Go to https://github.com/mergepay/mergepay-api
2. Click the **Issues** tab.
3. Click the **Labels** button (near the search box, next to "Milestones").
4. Click the green **New label** button (top right).

**For each label below:** type the **Name** exactly, click the color box and paste the
**Color** code, optionally type the description, then click **Create label**. Repeat 4 times.

| # | Name (type exactly) | Color | Description |
|---|---|---|---|
| 1 | `drips-wave` | `6C4DF6` | Tracked in a Drips Wave program |
| 2 | `complexity: trivial` | `BFE9F0` | Small, well-bounded task |
| 3 | `complexity: medium` | `D7F94B` | Moderate scope |
| 4 | `complexity: high` | `FF8A3C` | Large or cross-cutting task |

> Tip: GitHub already gives you a `good first issue` label by default — you don't need to create that one.

---

## STEP 5 — Create the 6 issues (detailed)

This is the most important step for getting selected. You'll create **6 issues** in the
**mergepay-api** repo by copy-pasting from below.

**How to create ONE issue:**
1. Go to https://github.com/mergepay/mergepay-api
2. Click the **Issues** tab → green **New issue** button.
3. Copy the **Title** from a box below into the "Title" field.
4. Copy the whole **Body** from the box into the big description field.
5. On the right side, click **Labels** and tick the labels listed for that issue.
6. Click **Submit new issue**.
7. Repeat for all 6.

Do that for each of the following. (These are also saved in the repo file
`mergepay-api/DRIPS_WAVE.md` if you prefer copying from there.)

---

### Issue 1 of 6
**Title:**
```
Publish an OpenAPI 3 spec and serve Swagger UI at /docs
```
**Labels to tick:** `drips-wave`, `complexity: medium`, `good first issue`

**Body:**
```
## Context / why
The REST API is documented in prose only. A machine-readable OpenAPI spec lets contributors explore the API, generate clients, and validate request/response shapes. Fastify integrates with @fastify/swagger + @fastify/swagger-ui.

## Where (files)
src/app.ts (register plugins), src/routes/* (attach route schemas), optionally a new src/openapi.ts.

## Scope
- Register @fastify/swagger and @fastify/swagger-ui (UI at /docs).
- Describe at least the auth, groups, expenses, settlement, and history routes, reusing the existing Zod schemas (zod-to-json-schema is fine).
- Document the standard error shape { error: { code, message } }.

## Acceptance criteria
- [ ] GET /docs serves interactive Swagger UI in dev.
- [ ] GET /docs/json (or /openapi.json) returns a valid OpenAPI 3 document.
- [ ] Auth, groups, expenses, settlement, and history endpoints appear with params, bodies, and responses.
- [ ] npm run build and npm test pass; a test asserts the spec endpoint returns 200 and openapi "3...".
- [ ] README links to /docs.

## Out of scope
No frontend changes; no auth changes.
```

---

### Issue 2 of 6
**Title:**
```
Add request IDs and structured request logging (with secret redaction)
```
**Labels to tick:** `drips-wave`, `complexity: trivial`, `good first issue`

**Body:**
```
## Context / why
Production debugging needs correlatable logs. Fastify ships with pino; we need a request id, a one-line completion log, and redaction so we never log Authorization headers or secrets.

## Where (files)
src/app.ts (Fastify logger + genReqId + hooks).

## Scope
- Generate a request id per request and echo it in an x-request-id response header.
- Log method, path, statusCode, and duration on response.
- Configure pino redact for req.headers.authorization and any token fields.

## Acceptance criteria
- [ ] Every response includes an x-request-id header.
- [ ] Completed requests emit one structured log line with method, path, status, ms, and request id.
- [ ] Authorization headers never appear in logs.
- [ ] A route test asserts the x-request-id header is present.
- [ ] npm run build and npm test pass.

## Out of scope
No external log shipping; no frontend changes.
```

---

### Issue 3 of 6
**Title:**
```
Idempotency keys for POST /settlements/:id/confirm
```
**Labels to tick:** `drips-wave`, `complexity: medium`

**Body:**
```
## Context / why
A client retry (flaky network, double-tap) could attempt to submit the same signed settlement twice. The XDR-mismatch guard already prevents tampering, but an Idempotency-Key makes confirm safely retryable and returns the original result.

## Where (files)
prisma/schema.prisma (new IdempotencyKey model + migration), src/routes/settlements.ts (confirm handler).

## Scope
- Accept an optional Idempotency-Key header on the confirm endpoint.
- Persist { key, requestHash, responseJson, createdAt }; on repeat with the same key, return the stored response instead of re-submitting.
- Same key + different request body should return 409 idempotency_conflict.

## Acceptance criteria
- [ ] First confirm with a key submits and stores the response.
- [ ] Repeat with same key + same body returns the stored response and does NOT call Horizon again (assert the mock is called once).
- [ ] Same key + different body returns 409 with { error: { code: "idempotency_conflict" } }.
- [ ] New Prisma model + migration committed; npm run build and npm test pass with new tests.

## Out of scope
Idempotency for other endpoints (follow-up); no frontend changes.
```

---

### Issue 4 of 6
**Title:**
```
Cursor pagination and filtering for GET /history and GET /groups/:id/ledger
```
**Labels to tick:** `drips-wave`, `complexity: high`

**Body:**
```
## Context / why
These endpoints return unbounded lists; they will not scale and are awkward to page in the UI. Add stable cursor pagination and basic filters.

## Where (files)
src/routes/history.ts, the /groups/:id/ledger route under src/routes/groups.ts, and any shared query helper in src/services/*.

## Scope
- Support limit (default 25, max 100) and an opaque cursor (e.g. base64 of createdAt,id).
- Support filters: assetCode, status, and from/to date range (all Zod-validated).
- Return { items, nextCursor }; nextCursor is null on the last page.
- Keep the default response backward compatible.

## Acceptance criteria
- [ ] Paging through a seeded fixture returns every item exactly once with no overlap.
- [ ] limit is clamped to the max; invalid cursor/filters return 400.
- [ ] Filters narrow results correctly (covered by tests).
- [ ] nextCursor is null only on the final page.
- [ ] npm run build and npm test pass with new pagination tests.

## Out of scope
Frontend wiring; offset pagination.
```

---

### Issue 5 of 6
**Title:**
```
Expand SEP-24 anchor service tests and add retry/backoff to anchor HTTP calls
```
**Labels to tick:** `drips-wave`, `complexity: medium`

**Body:**
```
## Context / why
src/services/anchor.ts carries the SEP-24 deposit/withdraw and webhook logic but is thinly tested, and transient anchor/network errors aren't retried. Hardening this is high-value and fully mockable.

## Where (files)
src/services/anchor.ts, new tests/anchor.test.ts.

## Scope
- Add exponential backoff with jitter (small, bounded retry count) around anchor HTTP calls; do NOT retry 4xx.
- Add tests for: anchor status to internal status mapping, webhook signature verification (valid and invalid x-anchor-signature), and the deposit/withdraw session happy path — all with mocked HTTP.

## Acceptance criteria
- [ ] tests/anchor.test.ts covers status mapping, webhook signature accept/reject, and a session happy path.
- [ ] Transient 5xx/network errors retry with backoff; 4xx do not retry (asserted via mock call counts).
- [ ] Anchor line coverage >= 90% (vitest run --coverage).
- [ ] Tests run offline; npm run build and npm test pass.

## Out of scope
Real anchor onboarding; frontend changes.
```

---

### Issue 6 of 6
**Title:**
```
Add a REST Client (.http) request collection for local API exploration
```
**Labels to tick:** `drips-wave`, `complexity: trivial`, `good first issue`

**Body:**
```
## Context / why
New contributors need a frictionless way to exercise the API. A committed .http collection (VS Code REST Client / JetBrains HTTP client) walks the full happy path: SEP-10 auth, create group, add expense, build settlement.

## Where (files)
New docs/api.http, a short section in README.md.

## Scope
- Provide requests for: POST /auth/challenge, POST /auth/verify, POST /groups, POST /groups/:id/expenses, POST /expenses/:id/settle, GET /history.
- Use variables for baseUrl and token so the flow is runnable end-to-end.
- Document usage in the README.

## Acceptance criteria
- [ ] docs/api.http exists and the requests are valid against a locally running API.
- [ ] Variables for base URL and bearer token are at the top and reused.
- [ ] README documents how to use it.
- [ ] No code changes to src/ (docs-only); npm run build still passes.

## Out of scope
Frontend changes; automated contract testing.
```

---

## STEP 6 — Apply to the Stellar Wave program

1. Back in the Drips **Wave** app, after your repo is synced (Step 3), find the active **Stellar** Wave program.
2. Click **Apply** and select your `mergepay-api` repo.
3. Only apply to the **Stellar** ecosystem — it matches your project.

---

## STEP 7 — Complete identity verification (KYC)

At some point Drips will ask you to verify your identity (KYC) before it can pay out
rewards. Just follow the prompt in the Drips app when it appears.

---

## That's everything

Once Steps 1–6 are done, your application is complete and strong:
- ✅ Public repo, on-chain ownership proven, MIT licensed
- ✅ Clear README + setup + contributing rules
- ✅ 6 well-scoped, labeled issues ready for contributors

Wave organizers will review and notify you by email + in-app when accepted.

---

### Order summary (tick as you go)
- [ ] Step 1 — Both repos set to Public
- [ ] Step 2 — Project claimed on app.drips.network (wallet connected)
- [ ] Step 3 — Drips Wave GitHub App installed on the `mergepay` org
- [ ] Step 4 — 4 labels created in mergepay-api
- [ ] Step 5 — All 6 issues created, each with its labels
- [ ] Step 6 — Applied to the Stellar Wave program
- [ ] Step 7 — KYC completed when prompted

> Need to deploy the app to a live URL too? That's optional for Drips. The step-by-step
> hosting guide (Neon + Render + Vercel) is preserved in git history — ask and I'll
> bring it back into its own file.
