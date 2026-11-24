import { expect, test, type Page, type Route } from "@playwright/test";
import * as StellarSdk from "@stellar/stellar-sdk";

/**
 * The complete core journey, end to end (#816):
 *
 *   sign in with Freighter → create a group → record shared expenses (one by
 *   you, one by another member) → read the balances and the suggested
 *   settlement → find an expense in the activity feed by its memo → settle
 *   your debt on Stellar → see it confirmed.
 *
 * The specs before this one stop at the suggested settlement paths; this is
 * the first to drive the payment itself: the settle-up modal fetches a payment
 * intent, verifies the unsigned envelope (recipient, asset, amount, `MP:`
 * memo), has Freighter sign it, hands it to the API and waits for the ledger.
 * A second test covers the Horizon polling fallback (#814): the API never
 * reports the outcome, and the modal confirms the payment from Horizon itself.
 *
 * Everything runs offline:
 *   - **Freighter** is answered in-page over the `window.postMessage`
 *     protocol `@stellar/freighter-api` speaks, so the real SEP-10 login and
 *     the real `signTransaction` call both run.
 *   - **The Mergepay API** is an in-memory fake that does the split and
 *     balance arithmetic itself and builds a genuine Stellar payment envelope
 *     for each settlement, so the app's envelope checks run against real XDR.
 *   - **Horizon** is answered per test; every other third-party host is
 *     refused. Nothing waits on `networkidle` — the app polls health, activity
 *     and the wallet forever, so it never goes idle. Every wait is on a
 *     `data-testid`, a role, or a recorded request.
 */

test.describe.configure({ timeout: 150_000 });

// ---------------------------------------------------------------------------
// Network the app under test targets
// ---------------------------------------------------------------------------

/** Mirrors `normalizeNetwork` in `src/lib/explorer.ts` — see the note in `group-creation-and-splitting.spec.ts`. */
const NETWORK_ALIASES: Record<string, "public" | "testnet"> = {
  public: "public",
  pubnet: "public",
  mainnet: "public",
  testnet: "testnet",
  test: "testnet",
};
const NETWORK: "public" | "testnet" =
  NETWORK_ALIASES[(process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "").trim().toLowerCase()] ?? "public";

const NETWORK_PASSPHRASE =
  NETWORK === "testnet" ? "Test SDF Network ; September 2015" : "Public Global Stellar Network ; September 2015";

// ---------------------------------------------------------------------------
// The circle of friends. The group page treats `user-1` as the signed-in user.
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  { id: "user-1", displayName: "Temi", stellarPublicKey: "GBLI7JERBEGKK3DLZNR7B2TNGDNNUMX5X5R5JCS3TODZNCKJA7W6KG7M" },
  { id: "user-2", displayName: "Ada", stellarPublicKey: "GCEW4M2WOHOJ4IJA76QVSHEPG7W5VEZFE7KQKZ3IV4TQZH2YC4ARO4YC" },
  { id: "user-3", displayName: "Wura", stellarPublicKey: "GCHYNEW3LUP26AESN32AEKJIDSHFVYRO5KYT772XG7FO2E7KXXN3XCR3" },
] as const;
const [TEMI, ADA] = ACCOUNTS;

function userDto(userId: string) {
  const account = ACCOUNTS.find((a) => a.id === userId) ?? TEMI;
  return { ...account, avatarUrl: null, createdAt: "2026-01-01T00:00:00.000Z" };
}

// ---------------------------------------------------------------------------
// Exact money: the API contract is a decimal string, so no float touches it
// ---------------------------------------------------------------------------

const STROOPS = 10_000_000n;

function toStroops(value: string): bigint {
  const negative = value.trim().startsWith("-");
  const [whole, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const units = BigInt(whole || "0") * STROOPS + BigInt(fraction.padEnd(7, "0").slice(0, 7));
  return negative ? -units : units;
}

function fromStroops(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = (abs % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${abs / STROOPS}${fraction ? `.${fraction}` : ""}`;
}

// ---------------------------------------------------------------------------
// Real Stellar envelopes, built the way the API builds them
// ---------------------------------------------------------------------------

/**
 * The slice of the SDK used here. `src/types/declarations.d.ts` shims the
 * package's types down to what app code needs, so this spec names the extra
 * pieces it relies on rather than widening the app-wide shim.
 */
interface Sdk {
  Account: new (accountId: string, sequence: string) => unknown;
  Asset: { native(): unknown };
  Memo: { text(value: string): unknown };
  Operation: { payment(opts: { destination: string; asset: unknown; amount: string }): unknown };
  TransactionBuilder: new (
    source: unknown,
    opts: { fee: string; networkPassphrase: string }
  ) => {
    addOperation(op: unknown): InstanceType<Sdk["TransactionBuilder"]>;
    addMemo(memo: unknown): InstanceType<Sdk["TransactionBuilder"]>;
    setTimeout(seconds: number): InstanceType<Sdk["TransactionBuilder"]>;
    build(): { toXDR(): string; hash(): { toString(encoding: "hex"): string } };
  };
}
const sdk = StellarSdk as unknown as Sdk;

/** An unsigned XLM payment with a text memo, plus the hash Horizon indexes it by. */
function paymentEnvelope(from: string, to: string, amount: string, memo: string) {
  const tx = new sdk.TransactionBuilder(new sdk.Account(from, "4242"), {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(sdk.Operation.payment({ destination: to, asset: sdk.Asset.native(), amount }))
    .addMemo(sdk.Memo.text(memo))
    .setTimeout(600)
    .build();
  return { xdr: tx.toXDR(), hash: tx.hash().toString("hex") };
}

// ---------------------------------------------------------------------------
// Freighter, answered in-page
// ---------------------------------------------------------------------------

/**
 * Two details are load-bearing (see `group-creation-and-splitting.spec.ts`):
 * the reply echoes the request id under the misspelled key `messagedId`, which
 * is what freighter-api 4.x compares, and the wallet keeps answering for the
 * life of the page because `WatchWalletChanges` polls it.
 */
async function installFreighter(page: Page): Promise<void> {
  const wallet: [string, string, string, string, string] = [
    TEMI.stellarPublicKey,
    NETWORK === "testnet" ? "TESTNET" : "PUBLIC",
    NETWORK === "testnet" ? "Testnet" : "Public",
    NETWORK === "testnet" ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org",
    NETWORK_PASSPHRASE,
  ];
  await page.addInitScript(([publicKey, network, networkName, networkUrl, networkPassphrase]) => {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const request = event.data as Record<string, unknown> | null;
      if (request?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
      const reply = (payload: Record<string, unknown>) =>
        window.postMessage(
          { source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: request.messageId, ...payload },
          window.location.origin
        );
      switch (request.type) {
        case "REQUEST_CONNECTION_STATUS":
          return reply({ isConnected: true });
        case "REQUEST_ALLOWED_STATUS":
        case "SET_ALLOWED_STATUS":
          return reply({ isAllowed: true });
        case "REQUEST_ACCESS":
        case "REQUEST_PUBLIC_KEY":
          return reply({ publicKey });
        case "REQUEST_NETWORK":
        case "REQUEST_NETWORK_DETAILS":
          return reply({ networkDetails: { network, networkName, networkUrl, networkPassphrase } });
        case "SUBMIT_TRANSACTION":
          // Recorded so the test can prove the wallet was asked to sign the
          // exact envelope the API issued. The fake API is the verifier.
          (window as unknown as { __signed?: string[] }).__signed = [
            ...((window as unknown as { __signed?: string[] }).__signed ?? []),
            String(request.transactionXdr),
          ];
          return reply({ signedTransaction: request.transactionXdr, signerAddress: publicKey });
        default:
          return reply({ apiError: { code: -1, message: `Unhandled Freighter request: ${String(request.type)}` } });
      }
    });
    // The submit buttons gate on connectivity; intercepted requests must not read as offline.
    Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true });
  }, wallet);
}

// ---------------------------------------------------------------------------
// The Mergepay API, in memory
// ---------------------------------------------------------------------------

interface FakeExpense {
  id: string;
  groupId: string;
  payerUserId: string;
  title: string;
  amount: string;
  memo: string | null;
  createdAt: string;
  shares: { userId: string; shareAmount: string }[];
}

interface FakeSettlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  memo: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  stellarTxHash: string | null;
  xdr: string;
  hash: string;
  createdAt: string;
}

interface FakeGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  memberUserIds: string[];
  expenses: FakeExpense[];
  settlements: FakeSettlement[];
}

/**
 * How the fake settles a payment once the app hands it the signed envelope:
 * `"confirm"` reports it confirmed on the next status poll; `"never"` leaves it
 * `submitted` forever, as an overloaded API would.
 */
type ConfirmMode = "confirm" | "never";

class FakeMergePay {
  readonly groups: FakeGroup[] = [];
  readonly unmatched: string[] = [];
  readonly expenseBodies: Record<string, unknown>[] = [];
  readonly settlementBodies: Record<string, unknown>[] = [];
  readonly confirmBodies: Record<string, unknown>[] = [];
  /** Every status the app was told for a settlement, in order. */
  readonly statusesServed: string[] = [];
  private seq = 0;

  constructor(private readonly confirmMode: ConfirmMode) {}

  private next(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  /** Another member records an expense from their own device. */
  recordExpenseBy(groupId: string, payerUserId: string, title: string, amount: string, memo: string): void {
    const group = this.groups.find((g) => g.id === groupId);
    if (!group) throw new Error(`no group ${groupId}`);
    group.expenses.unshift(this.makeExpense(group, payerUserId, title, amount, memo, group.memberUserIds));
  }

  private makeExpense(
    group: FakeGroup,
    payerUserId: string,
    title: string,
    amount: string,
    memo: string | null,
    participants: string[]
  ): FakeExpense {
    // Equal split in stroops; the indivisible remainder goes to the first participants.
    const total = toStroops(amount);
    const size = BigInt(participants.length);
    const base = total / size;
    const remainder = total % size;
    return {
      id: this.next("exp"),
      groupId: group.id,
      payerUserId,
      title,
      amount,
      memo,
      createdAt: new Date().toISOString(),
      shares: participants.map((userId, i) => ({
        userId,
        shareAmount: fromStroops(BigInt(i) < remainder ? base + 1n : base),
      })),
    };
  }

  /** Net position in XLM: paid − owed, adjusted by confirmed settlements. */
  netOf(group: FakeGroup, userId: string): bigint {
    let net = 0n;
    for (const e of group.expenses) {
      if (e.payerUserId === userId) net += toStroops(e.amount);
      for (const s of e.shares) if (s.userId === userId) net -= toStroops(s.shareAmount);
    }
    for (const s of group.settlements) {
      if (s.status !== "confirmed") continue;
      if (s.fromUserId === userId) net += toStroops(s.amount);
      if (s.toUserId === userId) net -= toStroops(s.amount);
    }
    return net;
  }

  private groupDto(g: FakeGroup) {
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      createdByUserId: TEMI.id,
      treasuryEnabled: false,
      treasuryAccountPublicKey: null,
      treasuryRequiredSigners: null,
      archived: false,
      createdAt: g.createdAt,
    };
  }

  private expenseDto(e: FakeExpense) {
    return {
      id: e.id,
      groupId: e.groupId,
      payerUserId: e.payerUserId,
      payer: userDto(e.payerUserId),
      title: e.title,
      description: null,
      amount: e.amount,
      assetCode: "XLM",
      assetIssuer: null,
      splitType: "equal",
      memo: e.memo,
      receiptUrl: null,
      createdAt: e.createdAt,
      shares: e.shares.map((s) => ({
        id: `${e.id}-${s.userId}`,
        expenseId: e.id,
        userId: s.userId,
        user: userDto(s.userId),
        shareAmount: s.shareAmount,
        status: "pending",
      })),
    };
  }

  private settlementDto(s: FakeSettlement) {
    return {
      id: s.id,
      groupId: s.groupId,
      fromUserId: s.fromUserId,
      from: userDto(s.fromUserId),
      toUserId: s.toUserId,
      to: userDto(s.toUserId),
      amount: s.amount,
      assetCode: "XLM",
      assetIssuer: null,
      stellarTxHash: s.stellarTxHash,
      status: s.status,
      memo: s.memo,
      expenseId: null,
      createdAt: s.createdAt,
    };
  }

  /** Activity events as the API reports them, memo tags included (#815). */
  private activityOf(g: FakeGroup) {
    const events = [
      ...g.memberUserIds.map((userId) => ({
        id: `act-join-${userId}`,
        groupId: g.id,
        type: "member_joined",
        actor: { id: userId, displayName: userDto(userId).displayName, avatarUrl: null },
        description: `Joined the group as ${userId === TEMI.id ? "admin" : "member"}`,
        timestamp: g.createdAt,
      })),
      ...g.expenses.map((e) => ({
        id: `act-${e.id}`,
        groupId: g.id,
        type: "expense_created",
        actor: { id: e.payerUserId, displayName: userDto(e.payerUserId).displayName, avatarUrl: null },
        description: `Added expense "${e.title}"`,
        amount: e.amount,
        assetCode: "XLM",
        memo: e.memo,
        timestamp: e.createdAt,
      })),
    ];
    return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async dispatch(route: Route): Promise<void> {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace(/\/$/, "");
    const send = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const body = (): Record<string, unknown> => {
      try {
        return (request.postDataJSON() ?? {}) as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    if (path === "/api/health") {
      return send({ status: "ok", uptime: 1, timestamp: new Date().toISOString(), dependencies: { api: "ok", stellar: "ok" } });
    }
    if (path === "/api/anchors") return send({ anchors: [] });
    if (path === "/api/anchors/sessions") return send({ sessions: [] });
    if (path === "/api/me") return send({ user: userDto(TEMI.id) });
    if (path === "/api/auth/challenge") {
      return send({ transaction: "e2e-sep10-challenge-xdr", networkPassphrase: NETWORK_PASSPHRASE });
    }
    if (path === "/api/auth/verify" || path === "/api/auth/refresh") {
      return send({ token: sessionToken(), user: userDto(TEMI.id) });
    }
    if (path === "/api/auth/logout") return send({ ok: true });

    if (path === "/api/groups") {
      if (method === "POST") {
        const { name, description } = body() as { name?: string; description?: string };
        const group: FakeGroup = {
          id: this.next("grp"),
          name: String(name ?? "").trim(),
          description: description?.trim() || null,
          createdAt: new Date(Date.now() - 60_000).toISOString(),
          // The real API adds the creator and invites the rest; the circle is
          // seeded here so an equal three-way split is possible straight away.
          memberUserIds: ACCOUNTS.map((a) => a.id),
          expenses: [],
          settlements: [],
        };
        this.groups.push(group);
        return send({ group: this.groupDto(group) }, 201);
      }
      return send({
        groups: this.groups.map((g) => ({
          ...this.groupDto(g),
          memberCount: g.memberUserIds.length,
          yourNet: fromStroops(this.netOf(g, TEMI.id)),
          netAssetCode: "XLM",
        })),
      });
    }

    const settlementRoute = /^\/api\/settlements\/([^/]+)(\/confirm)?$/.exec(path);
    if (settlementRoute) {
      const settlement = this.groups.flatMap((g) => g.settlements).find((s) => s.id === settlementRoute[1]);
      if (!settlement) return send({ error: "no such settlement" }, 404);
      if (settlementRoute[2] && method === "POST") {
        const data = body();
        this.confirmBodies.push(data);
        if (data.signedXdr !== settlement.xdr) return send({ error: "envelope does not match intent" }, 422);
        settlement.status = "submitted";
        this.statusesServed.push(settlement.status);
        return send({ settlement: this.settlementDto(settlement) });
      }
      if (this.confirmMode === "confirm" && settlement.status === "submitted") {
        settlement.status = "confirmed";
        settlement.stellarTxHash = settlement.hash;
      }
      this.statusesServed.push(settlement.status);
      return send({ settlement: this.settlementDto(settlement) });
    }

    const groupRoute = /^\/api\/groups\/([^/]+)(\/[a-z]+)?$/.exec(path);
    if (groupRoute) {
      const group = this.groups.find((g) => g.id === groupRoute[1]);
      if (!group) return send({ error: "no such group" }, 404);
      switch (groupRoute[2] ?? "") {
        case "":
          return send({
            group: this.groupDto(group),
            members: group.memberUserIds.map((userId) => ({
              id: `mem-${group.id}-${userId}`,
              groupId: group.id,
              userId,
              role: userId === TEMI.id ? "admin" : "member",
              joinedAt: group.createdAt,
              user: userDto(userId),
            })),
            yourRole: "admin",
          });
        case "/expenses": {
          if (method !== "POST") return send({ expenses: group.expenses.map((e) => this.expenseDto(e)) });
          const data = body();
          this.expenseBodies.push(data);
          const participants = (data.shares as { userId: string }[]).map((s) => s.userId);
          const expense = this.makeExpense(
            group,
            String(data.payerUserId ?? TEMI.id),
            String(data.title),
            String(data.amount),
            typeof data.memo === "string" && data.memo ? data.memo : null,
            participants
          );
          group.expenses.unshift(expense);
          return send({ expense: this.expenseDto(expense) }, 201);
        }
        case "/balances":
          return send({
            balances: group.memberUserIds.map((userId) => ({
              userId,
              user: userDto(userId),
              net: fromStroops(this.netOf(group, userId)),
              assetCode: "XLM",
            })),
            suggestions: [],
          });
        case "/settlements": {
          if (method !== "POST") return send({ settlements: group.settlements.map((s) => this.settlementDto(s)) });
          const data = body() as { toUserId: string; amount: string };
          this.settlementBodies.push(data);
          const to = userDto(data.toUserId);
          const memo = `MP:settle-${this.seq + 1}`;
          const { xdr, hash } = paymentEnvelope(TEMI.stellarPublicKey, to.stellarPublicKey, fromStroops(toStroops(data.amount)), memo);
          const settlement: FakeSettlement = {
            id: this.next("stl"),
            groupId: group.id,
            fromUserId: TEMI.id,
            toUserId: data.toUserId,
            amount: data.amount,
            memo,
            status: "pending",
            stellarTxHash: null,
            xdr,
            hash,
            createdAt: new Date().toISOString(),
          };
          group.settlements.push(settlement);
          return send({ settlement: this.settlementDto(settlement), xdr, networkPassphrase: NETWORK_PASSPHRASE }, 201);
        }
        case "/ledger":
          return send({ entries: [], nextCursor: null });
        case "/activity":
          return send({ activities: this.activityOf(group) });
      }
    }

    this.unmatched.push(`${method} ${path}`);
    return send({ error: `unhandled in e2e fake: ${method} ${path}` }, 404);
  }
}

/** A bearer token the app's expiry watcher accepts (it reads `exp`). */
function sessionToken(): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: TEMI.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.e2e`;
}

// ---------------------------------------------------------------------------
// Horizon
// ---------------------------------------------------------------------------

interface FakeHorizon {
  /** Hashes the app asked `GET /transactions/{hash}` about, in order. */
  transactionLookups: string[];
  /** Answer for a transaction lookup; `null` means "not in a ledger yet" (404). */
  transaction: (hash: string, lookup: number) => { ledger: number } | null;
}

async function installHorizon(page: Page, horizon: FakeHorizon): Promise<void> {
  await page.route(/^https:\/\/horizon(-testnet)?\.stellar\.org\//, (route) => {
    const path = new URL(route.request().url()).pathname;
    const tx = /^\/transactions\/([0-9a-f]{64})$/.exec(path);
    if (tx) {
      horizon.transactionLookups.push(tx[1]);
      const found = horizon.transaction(tx[1], horizon.transactionLookups.filter((h) => h === tx[1]).length);
      return found
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hash: tx[1], successful: true, ledger: found.ledger, envelope_xdr: "" }) })
        : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ status: 404, title: "Resource Missing" }) });
    }
    if (/^\/accounts\//.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ balances: [{ asset_type: "native", balance: "1000.0000000" }] }),
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
}

// ---------------------------------------------------------------------------
// Setup and steps
// ---------------------------------------------------------------------------

/**
 * The sign-in screen's server HTML and first client render disagree, and React
 * recovers by re-rendering on the client. It reproduces on the base commit
 * with every mock off (see `trackPageErrors` in
 * group-creation-and-splitting.spec.ts), so it is not part of this journey.
 * `next dev` words it as a hydration failure; a production build — what CI
 * serves — reports the minified codes for the same family (#418 text
 * mismatch, #423 recovered by client render, #425 text content). Anything
 * else, or any of these on another page, still fails the test.
 */
function isKnownLoginHydrationError(message: string, url: string): boolean {
  const onLogin = new URL(url).pathname === "/login";
  return onLogin && (/hydrat/i.test(message) || /Minified React error #(418|423|425)\b/.test(message));
}

async function setUp(page: Page, confirmMode: ConfirmMode, horizonAnswer: FakeHorizon["transaction"]) {
  const api = new FakeMergePay(confirmMode);
  const horizon: FakeHorizon = { transactionLookups: [], transaction: horizonAnswer };
  await installFreighter(page);
  // Most recently registered route wins: the catch-all for third parties goes
  // first, then Horizon, then the same-origin API.
  await page.route(/^https?:\/\/(?!(localhost|127\.0\.0\.1)[:/])/, (route) => route.abort());
  await installHorizon(page, horizon);
  await page.route(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\//, (route) => api.dispatch(route));
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (isKnownLoginHydrationError(error.message, page.url())) return;
    pageErrors.push(`${new URL(page.url()).pathname}: ${error.message}`);
  });
  return { api, horizon, pageErrors };
}

const balanceRow = (page: Page, userId: string) =>
  page.locator(`[data-testid="balance-row"][data-user-id="${userId}"]`);

/**
 * Sign in, create a group, have Ada record the hotel from her phone, and add
 * the suya stop yourself. Leaves the group page open with both expenses in.
 */
async function createGroupWithSharedExpenses(page: Page, api: FakeMergePay): Promise<string> {
  // -- sign in: the real connect → challenge → sign → verify flow ------------
  await page.goto("/login");
  await page.getByTestId("login-connect").click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // -- create the group (client-side nav only: the token lives in memory) ----
  await page.locator("aside").getByRole("link", { name: "Groups" }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await page.getByTestId("groups-create").click();
  const createDialog = page.getByRole("dialog", { name: "New group" });
  await createDialog.getByLabel("Group name").fill("Lagos roadtrip");
  await createDialog.getByLabel("Description (optional)").fill("Fuel, food and stays");
  await page.getByTestId("create-group-confirm").click();
  await expect(page).toHaveURL(/\/groups\/grp-1(?:\?.*)?$/);
  await expect(page.getByTestId("group-title")).toHaveText("Lagos roadtrip");
  await expect(createDialog).toHaveCount(0);
  const groupId = "grp-1";

  // -- Ada pays for the hotel on her own device ---------------------------------
  api.recordExpenseBy(groupId, ADA.id, "Hotel", "300", "MP:hotel-2");

  // -- you add the suya stop ----------------------------------------------------
  await page.getByTestId("group-add-expense").click();
  const expenseDialog = page.getByRole("dialog", { name: "Add Expense" });
  await expenseDialog.getByLabel("Title").fill("Suya stop");
  await expenseDialog.getByLabel("Amount", { exact: true }).fill("120");
  await expenseDialog.getByLabel("Memo (optional)").fill("MP:suya-1");
  await expect(expenseDialog.getByTestId("split-row-user-2")).toContainText("40.00 XLM");
  await page.getByTestId("add-expense-confirm").click();
  await expect(expenseDialog).toHaveCount(0);

  // Adding the expense refreshes the group, so Ada's hotel arrives with it.
  // Exactly two cards means the optimistic card was reconciled, not doubled.
  const cards = page.getByTestId("expense-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "Suya stop" })).toContainText("120.00 XLM");
  await expect(cards.filter({ hasText: "Hotel" })).toContainText("300.00 XLM");

  expect(api.expenseBodies).toEqual([
    expect.objectContaining({ title: "Suya stop", amount: "120", assetCode: "XLM", splitType: "equal", memo: "MP:suya-1" }),
  ]);
  return groupId;
}

/**
 * Balances after the two expenses: you paid 120 and owe 40 + 100, so you're
 * down 20; Ada paid 300 and owes 140, so she's up 160; Wura owes 140.
 * Simplified, that's two payments to Ada — and only yours is yours to make.
 */
async function expectBalancesBeforeSettlement(page: Page) {
  await expect(balanceRow(page, "user-1")).toContainText("-20.00 XLM");
  await expect(balanceRow(page, "user-2")).toContainText("+160.00 XLM");
  await expect(balanceRow(page, "user-3")).toContainText("-140.00 XLM");

  const paths = page.getByTestId("settlement-path");
  await expect(paths).toHaveCount(2);
  const yours = paths.and(page.locator('[data-from-user-id="user-1"]'));
  await expect(yours).toContainText("Ada");
  await expect(yours).toContainText("20.00 XLM");
  await expect(paths.and(page.locator('[data-from-user-id="user-3"]')).getByRole("button", { name: "Settle" })).toHaveCount(0);
  return yours;
}

/** Find the hotel in the activity feed by its memo tag, then clear the filter (#815). */
async function searchActivityByMemo(page: Page) {
  const memoFilter = page.getByLabel("Filter by memo tag");
  const events = page.getByRole("list", { name: "Group activity events" }).getByRole("listitem");
  await expect(events.filter({ hasText: 'Added expense "Hotel"' })).toHaveCount(1);

  await memoFilter.fill("hotel");
  await expect(events).toHaveCount(1);
  await expect(events.first()).toContainText('Added expense "Hotel"');
  await expect(events.first().getByTestId("activity-memo")).toHaveText("MP:hotel-2");

  await memoFilter.fill("no-such-memo");
  const empty = page.getByTestId("activity-empty-filtered");
  await expect(empty).toContainText("No matching activity found");
  await empty.getByTestId("activity-reset-filters").click();
  await expect(memoFilter).toHaveValue("");
  await expect(events.filter({ hasText: "Added expense" })).toHaveCount(2);
}

/**
 * Open the settle-up modal from your settlement path, checking the keyboard
 * contract on the way (#813): Escape closes it and hands focus back to the
 * Settle button, and Enter on that button opens it again.
 */
async function openSettleModal(page: Page, yours: ReturnType<typeof page.getByTestId>) {
  const settle = yours.getByRole("button", { name: "Settle" });
  await settle.click();
  const modal = page.getByRole("dialog", { name: "Settle up with Ada" });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("20.00 XLM");

  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(settle).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(modal).toBeVisible();
  return modal;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("core journey: group → shared expenses → balances → settlement (#816)", () => {
  test("creates a group, splits expenses, reads balances and settles on Stellar", async ({ page }) => {
    const { api, horizon, pageErrors } = await setUp(page, "confirm", () => null);

    await createGroupWithSharedExpenses(page, api);
    const yours = await expectBalancesBeforeSettlement(page);
    await searchActivityByMemo(page);

    // -- settle your 20 XLM with Ada ---------------------------------------------
    const modal = await openSettleModal(page, yours);
    await modal.getByRole("button", { name: /confirm & sign/i }).click();
    await expect(modal.getByText("Settled!")).toBeVisible({ timeout: 30_000 });

    // -- what crossed the wire -----------------------------------------------------
    expect(api.settlementBodies).toHaveLength(1);
    expect(api.settlementBodies[0]).toMatchObject({ toUserId: ADA.id, assetCode: "XLM" });
    expect(toStroops(String(api.settlementBodies[0].amount))).toBe(toStroops("20"));
    const issued = api.groups[0].settlements[0];
    // Freighter was asked to sign exactly the envelope the API issued, and the
    // API received it back signed.
    const signed = await page.evaluate(() => (window as unknown as { __signed?: string[] }).__signed ?? []);
    expect(signed.at(-1)).toBe(issued.xdr);
    expect(api.confirmBodies).toEqual([{ signedXdr: issued.xdr }]);
    expect(api.statusesServed.at(-1)).toBe("confirmed");
    await expect(modal).toContainText(issued.memo.replace("MP:", ""));

    // The API answered, so Horizon was never needed.
    expect(horizon.transactionLookups).toEqual([]);

    // -- the group afterwards ---------------------------------------------------------
    await modal.getByRole("button", { name: "Done" }).click();
    await expect(modal).toHaveCount(0);
    // Your debt is cleared; Wura's payment to Ada is the only one left.
    await expect(page.getByTestId("settlement-path")).toHaveCount(1);
    await expect(page.locator('[data-testid="settlement-path"][data-from-user-id="user-1"]')).toHaveCount(0);

    expect(api.unmatched, `unhandled API calls: ${api.unmatched.join(", ")}`).toEqual([]);
    expect(pageErrors, `uncaught errors:\n${pageErrors.join("\n")}`).toEqual([]);
  });

  test("confirms the settlement from Horizon when the API never reports back (#814)", async ({ page }) => {
    // Horizon hasn't seen the payment on the first lookup, then has it in a ledger.
    const { api, horizon, pageErrors } = await setUp(page, "never", (_hash, lookup) =>
      lookup >= 2 ? { ledger: 51_234 } : null
    );

    await createGroupWithSharedExpenses(page, api);
    const yours = await expectBalancesBeforeSettlement(page);

    const modal = await openSettleModal(page, yours);
    await modal.getByRole("button", { name: /confirm & sign/i }).click();

    // After the API's grace period the modal says it is asking Stellar itself…
    await expect(modal.getByText(/checking Stellar directly/i)).toBeVisible({ timeout: 30_000 });
    // …and confirms from the ledger while the API still says "submitted".
    await expect(modal.getByText("Settled!")).toBeVisible({ timeout: 30_000 });

    const issued = api.groups[0].settlements[0];
    expect(horizon.transactionLookups.length).toBeGreaterThanOrEqual(2);
    expect(new Set(horizon.transactionLookups)).toEqual(new Set([issued.hash]));
    expect(api.statusesServed).not.toContain("confirmed");
    // Waiting never re-submits: one intent, one signature, one hand-off.
    expect(api.settlementBodies).toHaveLength(1);
    expect(api.confirmBodies).toHaveLength(1);
    // The receipt links the transaction by the hash derived from the signed envelope.
    await expect(modal.getByRole("link").filter({ hasText: issued.hash.slice(0, 6) })).toHaveCount(1);

    expect(api.unmatched, `unhandled API calls: ${api.unmatched.join(", ")}`).toEqual([]);
    expect(pageErrors, `uncaught errors:\n${pageErrors.join("\n")}`).toEqual([]);
  });
});
