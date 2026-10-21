import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * End-to-end coverage for the journey Mergepay exists for (#540): sign in with
 * Freighter, create a group, record an expense, and read the balances and
 * settlement paths that fall out of the split. It also covers the two rules
 * #544 and #543 added underneath it — an amount field that refuses a precision
 * Stellar cannot represent, and a wallet identity that survives a reload.
 *
 * Headless execution needs two substitutions, because neither of the app's
 * dependencies exists in CI:
 *
 *   1. **The wallet.** There is no browser extension to talk to, so
 *      {@link installFreighter} answers the `window.postMessage` protocol
 *      `@stellar/freighter-api` speaks — the same messages Freighter's content
 *      script sends — which lets a real SEP-10 login run end to end: connect,
 *      network check, challenge, signature, verify.
 *
 *   2. **The backend.** Only four `/api/*` routes exist in this repo; the rest
 *      proxy to a service that is not running. {@link installFakeApi} therefore
 *      serves every call these pages make from an in-memory store, and does the
 *      split arithmetic itself, so the assertions are about the app rendering
 *      truthful numbers rather than echoing a fixture.
 *
 * Horizon and CoinGecko are refused rather than faked: a test account does not
 * exist on mainnet, and every consumer of those calls already degrades to
 * "balance unavailable" / static rates. Nothing here waits on `networkidle` —
 * the app polls health, activity and the wallet forever, so it never goes idle.
 */

// First compile of a route under `next dev` is not instant, and these specs
// cover four routes plus a reload.
test.describe.configure({ timeout: 120_000 });

// ---------------------------------------------------------------------------
// What the fake has to agree with the app about
// ---------------------------------------------------------------------------

/**
 * Mirrors `normalizeNetwork` in `src/lib/explorer.ts`. The wallet must report
 * the network this build targets or `assertWalletNetwork` refuses the login,
 * and the two places that read it have to agree: CI sets
 * `NEXT_PUBLIC_STELLAR_NETWORK=testnet` for the suite, while a plain
 * `npm run dev` defaults to mainnet. The Playwright web server inherits this
 * process's environment, so reading the same variable keeps both in step.
 */
const NETWORK_ALIASES: Record<string, "public" | "testnet"> = {
  public: "public",
  pubnet: "public",
  mainnet: "public",
  testnet: "testnet",
  test: "testnet",
};

const NETWORK: "public" | "testnet" =
  NETWORK_ALIASES[
    (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "").trim().toLowerCase()
  ] ?? "public";

const NETWORK_PASSPHRASE =
  NETWORK === "testnet"
    ? "Test SDF Network ; September 2015"
    : "Public Global Stellar Network ; September 2015";

/**
 * Three housemates. The group page reads its current user from the session
 * response, and `src/app/(app)/groups/[id]/page.tsx` hardcodes `user-1`, so the
 * signed-in account has to be the first one here.
 */
const ACCOUNTS = [
  { id: "user-1", displayName: "Temi", stellarPublicKey: "GBLI7JERBEGKK3DLZNR7B2TNGDNNUMX5X5R5JCS3TODZNCKJA7W6KG7M" },
  { id: "user-2", displayName: "Ada", stellarPublicKey: "GCEW4M2WOHOJ4IJA76QVSHEPG7W5VEZFE7KQKZ3IV4TQZH2YC4ARO4YC" },
  { id: "user-3", displayName: "Wura", stellarPublicKey: "GCHYNEW3LUP26AESN32AEKJIDSHFVYRO5KYT772XG7FO2E7KXXN3XCR3" },
];

/** `UserSchema` as the API returns it. */
function userDto(userId: string) {
  const account = ACCOUNTS.find((a) => a.id === userId) ?? ACCOUNTS[0];
  return {
    id: account.id,
    stellarPublicKey: account.stellarPublicKey,
    displayName: account.displayName,
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Exact money, because the API contract is a decimal string
// ---------------------------------------------------------------------------

const STROOPS = 10_000_000n;

/** Read an API decimal string into stroops. No `Number` ever touches money. */
function toStroops(value: string): bigint {
  const [whole, fraction = ""] = value.replace("+", "").split(".");
  const units =
    BigInt(whole || "0") * STROOPS + BigInt(fraction.padEnd(7, "0").slice(0, 7));
  return value.startsWith("-") ? -units : units;
}

/** The inverse of {@link toStroops}, trimmed the way the API trims it. */
function fromStroops(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = (abs % STROOPS)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");
  return `${sign}${abs / STROOPS}${fraction ? `.${fraction}` : ""}`;
}

// ---------------------------------------------------------------------------
// The wallet: Freighter's external message protocol, answered in-page
// ---------------------------------------------------------------------------

/**
 * Respond to `@stellar/freighter-api` as though the extension were installed.
 *
 * Two details are load-bearing and easy to "fix" by accident:
 *   - the response echoes the request's `messageId` under the key
 *     **`messagedId`** — that misspelling is what v4.1.0's listener compares,
 *     so a corrected spelling leaves every wallet call hanging until its
 *     timeout; and
 *   - `REQUEST_PUBLIC_KEY` and `REQUEST_NETWORK_DETAILS` must keep answering
 *     for the life of the page. `WatchWalletChanges` polls both every two
 *     seconds after login, and treats an error or an empty address as "the
 *     wallet disconnected", which logs the user straight back out.
 */
async function installFreighter(page: Page): Promise<void> {
  // Typed as a tuple because `addInitScript` re-types this array as its
  // `PageFunction` argument — the values below, in this order, are what the
  // serialized handler destructures.
  const wallet: [publicKey: string, network: string, networkName: string, networkUrl: string, networkPassphrase: string] = [
    ACCOUNTS[0].stellarPublicKey,
    NETWORK,
    NETWORK === "testnet" ? "Testnet" : "Public",
    NETWORK === "testnet"
      ? "https://horizon-testnet.stellar.org"
      : "https://horizon.stellar.org",
    NETWORK_PASSPHRASE,
  ];

  await page.addInitScript(
    ([publicKey, network, networkName, networkUrl, networkPassphrase]) => {
      window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const request = event.data as Record<string, unknown> | null;
        if (request?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;

        const reply = (payload: Record<string, unknown>) =>
          window.postMessage(
            {
              source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
              messagedId: request.messageId,
              ...payload,
            },
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
            return reply({
              networkDetails: { network, networkName, networkUrl, networkPassphrase },
            });
          case "SUBMIT_TRANSACTION":
            // The signature is never inspected here: the API below is the
            // verifier, and what is being tested is that the app asks the
            // wallet to sign the challenge it was handed.
            return reply({
              signedTransaction: request.transactionXdr,
              signerAddress: publicKey,
            });
          default:
            return reply({
              apiError: {
                code: -1,
                message: `Unhandled Freighter request in e2e: ${String(request.type)}`,
              },
            });
        }
      });
    },
    wallet
  );
}

// ---------------------------------------------------------------------------
// The backend: an in-memory Mergepay that actually does the split maths
// ---------------------------------------------------------------------------

interface FakeGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  memberUserIds: string[];
  expenses: FakeExpense[];
}

interface FakeExpense {
  id: string;
  groupId: string;
  payerUserId: string;
  title: string;
  description: string | null;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  memo: string | null;
  createdAt: string;
  shares: { userId: string; shareAmount: string }[];
}

/** Handle for the state a test wants to inspect after driving the UI. */
interface FakeApi {
  /** Bodies of `POST /api/groups/:id/expenses`, as the app sent them. */
  expenseRequests: Record<string, unknown>[];
  /** Calls the fake had no answer for — asserted empty, so gaps surface. */
  unmatched: string[];
}

/**
 * A session token the app's own expiry watcher accepts: `useTokenExpiry` reads
 * the `exp` claim and signs the user out as it passes, so a token with no
 * payload would end the session on its own timetable.
 */
function sessionToken(): string {
  const base64url = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    sub: ACCOUNTS[0].id,
    exp: expiresAt,
  })}.e2e-signature`;
}

/**
 * Serve every `/api/*` call these pages make.
 *
 * Response bodies are shaped to the schemas in `src/lib/schemas.ts`, which the
 * client validates at runtime — so a field the fake gets wrong surfaces as a
 * validation error in the UI rather than a silent pass.
 */
async function installFakeApi(page: Page, api: FakeApi): Promise<void> {
  const groups: FakeGroup[] = [];
  let groupSequence = 1;
  let expenseSequence = 1;

  const groupDto = (group: FakeGroup) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    createdByUserId: ACCOUNTS[0].id,
    treasuryEnabled: false,
    treasuryAccountPublicKey: null,
    treasuryRequiredSigners: null,
    archived: false,
    createdAt: group.createdAt,
  });

  /** Net for one member of one group, in the group's expense asset. */
  const netOf = (group: FakeGroup, userId: string, assetCode: string): string => {
    let net = 0n;
    for (const expense of group.expenses) {
      if (expense.assetCode !== assetCode) continue;
      if (expense.payerUserId === userId) net += toStroops(expense.amount);
      for (const share of expense.shares) {
        if (share.userId === userId) net -= toStroops(share.shareAmount);
      }
    }
    return fromStroops(net);
  };

  const assetsOf = (group: FakeGroup) => [
    ...new Set(group.expenses.map((e) => e.assetCode)),
  ];

  const expenseDto = (expense: FakeExpense) => ({
    id: expense.id,
    groupId: expense.groupId,
    payerUserId: expense.payerUserId,
    payer: userDto(expense.payerUserId),
    title: expense.title,
    description: expense.description,
    amount: expense.amount,
    assetCode: expense.assetCode,
    assetIssuer: expense.assetIssuer,
    splitType: "equal",
    memo: expense.memo,
    receiptUrl: null,
    createdAt: expense.createdAt,
    shares: expense.shares.map((share) => ({
      id: `${expense.id}-share-${share.userId}`,
      expenseId: expense.id,
      userId: share.userId,
      user: userDto(share.userId),
      shareAmount: share.shareAmount,
      status: "pending",
    })),
  });

  /**
   * The equal-split rule the app uses, run server-side like the real one:
   * divide in stroops and hand the indivisible remainder to the first
   * participants, so the shares always sum to the total exactly.
   */
  const splitEqually = (total: bigint, userIds: string[]): bigint[] => {
    const size = BigInt(userIds.length);
    const base = total / size;
    const remainder = total % size;
    return userIds.map((_, index) =>
      BigInt(index) < remainder ? base + 1n : base
    );
  };

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace(/\/$/, "");
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/health") return send({ status: "ok" });
    if (path === "/api/anchors") return send({ anchors: [] });
    if (path === "/api/me" && method === "GET")
      return send({ user: userDto(ACCOUNTS[0].id) });

    // -- SEP-10 -------------------------------------------------------------
    if (path === "/api/auth/challenge" && method === "POST") {
      const { account } = (await request.postDataJSON()) as { account: string };
      if (account !== ACCOUNTS[0].stellarPublicKey) {
        return send({ error: "unknown account" }, 400);
      }
      // An opaque envelope to sign: this fake is the verifier, so it only has
      // to hand back what it was given.
      return send({
        transaction: "e2e-sep10-challenge-xdr",
        networkPassphrase: NETWORK_PASSPHRASE,
      });
    }
    if (path === "/api/auth/verify" && method === "POST") {
      const { transaction } = (await request.postDataJSON()) as {
        transaction: string;
      };
      if (!transaction) return send({ error: "no signature" }, 401);
      return send({ token: sessionToken(), user: userDto(ACCOUNTS[0].id) });
    }
    if (path === "/api/auth/logout" && method === "POST")
      return send({ ok: true });

    // -- groups -------------------------------------------------------------
    if (path === "/api/groups") {
      if (method === "POST") {
        const body = (await request.postDataJSON()) as {
          name?: string;
          description?: string;
        };
        const group: FakeGroup = {
          id: `grp-${groupSequence++}`,
          name: String(body.name ?? "").trim() || "Untitled",
          // The test circle is three people; a real backend adds the creator
          // and invites the rest, which no path here exercises.
          description: body.description?.trim() || null,
          createdAt: new Date().toISOString(),
          memberUserIds: ACCOUNTS.map((a) => a.id),
          expenses: [],
        };
        groups.push(group);
        return send({ group: groupDto(group) }, 201);
      }
      return send({
        groups: groups.map((group) => ({
          ...groupDto(group),
          memberCount: group.memberUserIds.length,
          yourNet: netOf(group, ACCOUNTS[0].id, assetsOf(group)[0] ?? "XLM"),
          netAssetCode: assetsOf(group)[0] ?? "XLM",
        })),
      });
    }

    const groupRoute = /^\/api\/groups\/([^/]+)(\/.*)?$/.exec(path);
    const group = groupRoute
      ? groups.find((g) => g.id === groupRoute[1])
      : undefined;
    if (groupRoute) {
      const sub = groupRoute[2] ?? "";
      if (!group) return send({ error: "no such group" }, 404);

      if (sub === "") {
        return send({
          group: groupDto(group),
          members: group.memberUserIds.map((userId) => ({
            id: `member-${group.id}-${userId}`,
            groupId: group.id,
            userId,
            role: userId === ACCOUNTS[0].id ? "admin" : "member",
            joinedAt: group.createdAt,
            user: userDto(userId),
          })),
          yourRole: "admin",
        });
      }

      if (sub === "/expenses") {
        if (method !== "POST")
          return send({ expenses: group.expenses.map(expenseDto) });

        const body = (await request.postDataJSON()) as Record<string, unknown>;
        api.expenseRequests.push(body);
        if (body.splitType !== "equal") {
          // Loud rather than wrong: this fake only knows how to divide a total
          // evenly, which is the split under test.
          return send(
            { error: `e2e fake splits equally only (got ${body.splitType})` },
            501
          );
        }
        const participants = (body.shares as { userId: string }[]).map(
          (share) => share.userId
        );
        const amounts = splitEqually(
          toStroops(String(body.amount)),
          participants
        );
        const expense: FakeExpense = {
          id: `exp-${expenseSequence++}`,
          groupId: group.id,
          payerUserId: String(body.payerUserId ?? ACCOUNTS[0].id),
          title: String(body.title),
          description: typeof body.description === "string" ? body.description : null,
          amount: String(body.amount),
          assetCode: String(body.assetCode),
          assetIssuer: (body.assetIssuer as string | null) ?? null,
          memo: typeof body.memo === "string" ? body.memo : null,
          createdAt: new Date().toISOString(),
          shares: participants.map((userId, index) => ({
            userId,
            shareAmount: fromStroops(amounts[index]),
          })),
        };
        group.expenses.unshift(expense);
        return send({ expense: expenseDto(expense) }, 201);
      }

      if (sub === "/balances") {
        // `suggestions` is part of the contract but the panel derives its own
        // settlement paths from `balances`, so the fake leaves the list empty.
        return send({
          balances: assetsOf(group).flatMap((assetCode) =>
            group.memberUserIds.map((userId) => ({
              userId,
              user: userDto(userId),
              net: netOf(group, userId, assetCode),
              assetCode,
            }))
          ),
          suggestions: [],
        });
      }

      // The ledger only feeds the export menu here, and the activity feed
      // accepts any list — an empty pair keeps both views honest and quiet.
      if (sub === "/ledger") return send({ entries: [], nextCursor: null });
      if (sub === "/activity") return send({ activities: [] });
    }

    api.unmatched.push(`${method} ${path}`);
    return send({ error: `unhandled in e2e fake: ${method} ${path}` }, 404);
  });
}

/** Unreachable third-party services, in place of a wallet with no history. */
async function refuseExternalHosts(page: Page): Promise<void> {
  await page.route(/stellar\.org|coingecko\.com/, (route) => route.abort());
}

async function setUpFakeApp(page: Page): Promise<FakeApi> {
  const api: FakeApi = { expenseRequests: [], unmatched: [] };
  await installFreighter(page);
  await installFakeApi(page, api);
  // Installed last on purpose: when several routes match a request, the most
  // recently registered one wins, and CoinGecko's URL
  // (`https://api.coingecko.com/api/v3/simple/price`) also satisfies the fake's
  // `**/api/**` glob. Refusing it first keeps a third-party rate call out of the
  // fake's store — and out of `api.unmatched`.
  await refuseExternalHosts(page);
  return api;
}

/** Drive the real connect → challenge → sign → verify login, not a shortcut. */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-connect").click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Signed in, with a three-member group open and its Add Expense dialog shown. */
async function openAddExpenseDialog(page: Page): Promise<void> {
  await signIn(page);

  // Client-side navigation only: the session token lives in memory, so a full
  // page load would land back on the sign-in screen.
  await page.locator("aside").getByRole("link", { name: "Groups" }).click();
  await expect(page).toHaveURL(/\/groups$/);
  await page.getByTestId("groups-create").click();

  const createDialog = page.getByRole("dialog", { name: "New group" });
  await createDialog.getByLabel("Group name").fill("Lagos roadtrip");
  await page.getByTestId("create-group-confirm").click();
  // The group page restates its paging default in the URL, so match the path.
  await expect(page).toHaveURL(/\/groups\/grp-1(?:\?.*)?$/);

  await page.getByTestId("group-add-expense").click();
  await expect(page.getByRole("dialog", { name: "Add Expense" })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Collects uncaught exceptions on `page`, with the dev server's hydration
 * failures excluded — and that exclusion is earned.
 *
 * Under `next dev` the sign-in screen reports that its server HTML and its
 * first client render do not match, and React replaces the root and continues
 * as a client render. It reproduces on the commit this branch starts from, with
 * every mock switched off, so it is not something the journey under test
 * introduces — but it would fail every run of it. Anything other than that
 * hydration failure still fails the assertion.
 */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (/hydration/i.test(error.message)) return;
    errors.push(error.message);
  });
  return errors;
}

test.describe("group creation and expense splitting", () => {
  test("signs in, creates a group, splits an expense and settles up", async ({
    page,
  }) => {
    const api = await setUpFakeApp(page);
    const pageErrors = trackPageErrors(page);

    await signIn(page);

    // -- create the group ---------------------------------------------------
    await page.locator("aside").getByRole("link", { name: "Groups" }).click();
    await expect(page.getByTestId("group-card")).toHaveCount(0);
    await page.getByTestId("groups-create").click();

    const createDialog = page.getByRole("dialog", { name: "New group" });
    await createDialog.getByLabel("Group name").fill("Lagos roadtrip");
    await createDialog.getByLabel("Description (optional)").fill("Fuel and stays");
    await page.getByTestId("create-group-confirm").click();

    await expect(page).toHaveURL(/\/groups\/grp-1(?:\?.*)?$/);
    await expect(page.getByTestId("group-title")).toHaveText("Lagos roadtrip");

    // The dialog has to be gone and the group's three members on screen — the
    // members are what make an equal split of three possible at all.
    await expect(createDialog).toHaveCount(0);
    await expect(page.getByTestId("balance-row")).toHaveCount(0);

    // -- record the expense -------------------------------------------------
    await page.getByTestId("group-add-expense").click();
    const expenseDialog = page.getByRole("dialog", { name: "Add Expense" });
    await expenseDialog.getByLabel("Title").fill("Suya stop");
    await expenseDialog.getByLabel("Amount", { exact: true }).fill("120.00");
    await expenseDialog.getByLabel("Memo (optional)").fill("MP:suya-1");

    // Equal shares of 120 across the three members, shown before submitting.
    await expect(expenseDialog.getByTestId("split-row-user-2")).toContainText(
      "40.00 XLM"
    );

    await page.getByTestId("add-expense-confirm").click();
    await expect(expenseDialog).toHaveCount(0);

    // The card is created optimistically and then replaced by the server's
    // copy; waiting for exactly one means the reconciliation settled.
    const expenseCard = page.getByTestId("expense-card");
    await expect(expenseCard).toHaveCount(1);
    await expect(expenseCard).toHaveAttribute("data-expense-id", "exp-1");
    await expect(expenseCard).toContainText("Suya stop");
    await expect(expenseCard).toContainText("120.00 XLM");

    // -- what the app actually sent ----------------------------------------
    // The wire body is the part a rendered card cannot prove: the amount left
    // as the exact decimal string it was typed as (#544), and the memo in the
    // `MP:` form the ledger reconciles against (#541).
    expect(api.expenseRequests).toHaveLength(1);
    expect(api.expenseRequests[0]).toMatchObject({
      title: "Suya stop",
      amount: "120.00",
      assetCode: "XLM",
      splitType: "equal",
      payerUserId: "user-1",
      memo: "MP:suya-1",
    });
    expect((api.expenseRequests[0].shares as { userId: string }[]).map((s) => s.userId)).toEqual([
      "user-1",
      "user-2",
      "user-3",
    ]);

    // -- the split, per member ---------------------------------------------
    await expenseCard.getByRole("button", { name: /expand expense/i }).click();
    await expect(expenseCard.getByTestId("expense-share")).toHaveCount(3);
    for (const userId of ["user-1", "user-2", "user-3"]) {
      await expect(
        expenseCard.locator(
          `[data-testid="expense-share"][data-user-id="${userId}"]`
        )
      ).toContainText("40.00 XLM");
    }
    await expect(expenseCard.getByTestId("memo-badge")).toHaveText(/verified/i);

    // -- balances and settlement paths --------------------------------------
    // Temi paid 120 and owes 40, so is owed 80; the others owe 40 each.
    await expect(
      page.locator('[data-testid="balance-row"][data-user-id="user-1"]')
    ).toContainText("+80.00 XLM");
    await expect(
      page.locator('[data-testid="balance-row"][data-user-id="user-2"]')
    ).toContainText("-40.00 XLM");
    await expect(
      page.locator('[data-testid="balance-row"][data-user-id="user-3"]')
    ).toContainText("-40.00 XLM");

    // Two debtors, one creditor: the panel must offer exactly two payments,
    // and no payment from the person who is owed.
    const paths = page.getByTestId("settlement-path");
    await expect(paths).toHaveCount(2);
    await expect(paths.nth(0)).toHaveAttribute("data-from-user-id", "user-2");
    await expect(paths.nth(1)).toHaveAttribute("data-from-user-id", "user-3");

    expect(api.unmatched, `unhandled API calls: ${api.unmatched.join(", ")}`).toEqual(
      []
    );
    expect(pageErrors, `uncaught errors:\n${pageErrors.join("\n")}`).toEqual([]);
  });

  test("refuses an eighth decimal place while an amount is being typed", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await openAddExpenseDialog(page);

    const amount = page
      .getByRole("dialog", { name: "Add Expense" })
      .getByLabel("Amount", { exact: true });
    await amount.click();
    await amount.pressSequentially("1.12345678");

    // The eighth place is refused as it is typed rather than rejected on
    // submit, so the field can never hold a value Stellar cannot represent.
    await expect(amount).toHaveValue("1.1234567");

    // And the capped value is a valid one: no error is raised for it.
    await amount.blur();
    await expect(amount).not.toHaveAttribute("aria-invalid");
    await expect(page.locator("#expense-amount-error")).toHaveCount(0);

    // Exponential notation and a sign are blocked outright: an amount field is
    // decimal digits, and `1e-7` would otherwise arrive as a string the schema
    // has to un-spin.
    await amount.fill("");
    await amount.pressSequentially("1e5");
    await expect(amount).toHaveValue("15");

    // A half-typed amount is the one case the gate cannot resolve, so the
    // field error carries it — announced, and wired to the input.
    await amount.fill("7.");
    await amount.blur();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#expense-amount-error")).toHaveText(
      "Amount must be a plain number with at most 7 decimal places"
    );
  });

  test("keeps the wallet identity across a reload without leaking the token", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await signIn(page);

    // Reload drops the bearer token — it is memory-only by design — so the app
    // comes back unauthenticated while keeping the public identity it needs to
    // name the account on the sign-in screen (#543).
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);

    // The restore resolves rather than stranding the guard on its spinner.
    await expect(page.getByTestId("login-restoring")).toHaveCount(0);
    await expect(page.getByTestId("login-wallet")).toContainText(
      "GBLI…KG7M"
    );

    // What reached storage is public identity and nothing else: no credential,
    // no signature, no session flag a tampered payload could re-mint.
    const persisted = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mergepay.token") ?? "{}")
    );
    expect(Object.keys(persisted.state).sort()).toEqual([
      "lastAuthenticatedAt",
      "user",
    ]);
    expect(JSON.stringify(persisted)).not.toContain("e2e-signature");
  });

  test("surfaces inline validation on too-short group name before allowing creation", async ({
    page,
  }) => {
    await setUpFakeApp(page);
    await signIn(page);

    await page.getByRole("button", { name: /new group/i }).first().click();
    const dialog = page.getByRole("dialog", { name: "New group" });
    const nameInput = dialog.getByLabel("Group name");
    await nameInput.fill("A");
    await nameInput.blur();

    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.locator("#g-name-error")).toContainText(
      "Group name must be at least 2 characters"
    );
  });
});
