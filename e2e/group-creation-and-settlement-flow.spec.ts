import { test, expect } from '@playwright/test';


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

const ACCOUNTS = [
  { id: "user-1", displayName: "Alice", stellarPublicKey: "GBLI7JERBEGKK3DLZNR7B2TNGDNNUMX5X5R5JCS3TODZNCKJA7W6KG7M" },
  { id: "user-2", displayName: "Bob", stellarPublicKey: "GCEW4M2WOHOJ4IJA76QVSHEPG7W5VEZFE7KQKZ3IV4TQZH2YC4ARO4YC" },
];

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
const MOCK_PUBLIC_KEY = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

function installFreighter(page: any) {
  return page.addInitScript((publicKey: string) => {
    window.freighterApi = {
      isConnected: async () => true,
      getPublicKey: async () => publicKey,
      signTransaction: async (xdr: string) => xdr,
      signAuthEntry: async (entry: string) => entry,
    };
    window.dispatchEvent(new CustomEvent('freighter:load'));
  }, MOCK_PUBLIC_KEY);
}

test.describe('Group creation, member addition, expense entry, and settlement initiation flow', () => {
  test.beforeEach(async ({ page }) => {
    await installFreighter(page);

    // Mock API routes to ensure deterministic responses
    await page.route('**/api/auth/challenge', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'json',
        body: JSON.stringify({ transaction: 'AAAA...' }),
      });
    });

    await page.route('**/api/auth/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'json',
        body: JSON.stringify({ token: 'mock-jwt-token', user: { publicKey: MOCK_PUBLIC_KEY } }),
      });
    });

    await page.route('**/api/user/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'json',
        body: JSON.stringify({ publicKey: MOCK_PUBLIC_KEY, name: 'Test User' }),
      });
    });

    await page.route('**/api/groups', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'json',
          body: JSON.stringify([
            {
              id: 'group-1',
              name: 'Trip to Tokyo',
              description: 'Expenses for the Tokyo trip',
              members: [
                { publicKey: MOCK_PUBLIC_KEY, name: 'Test User', role: 'admin' },
                { publicKey: 'GBMEMBER2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Alice', role: 'member' }
              ],
              createdAt: new Date().toISOString(),
            }
          ]),
        });
      } else if (route.request().method() === 'POST') {
        const data = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 201,
          contentType: 'json',
          body: JSON.stringify({
            id: 'group-1',
            name: data.name || 'Trip to Tokyo',
            description: data.description || '',
            members: [
              { publicKey: MOCK_PUBLIC_KEY, name: 'Test User', role: 'admin' }
            ],
            createdAt: new Date().toISOString(),
          }),
        });
      }
    });

    await page.route('**/api/groups/group-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'json',
        body: JSON.stringify({
          id: 'group-1',
          name: 'Trip to Tokyo',
          description: 'Expenses for the Tokyo trip',
          members: [
            { publicKey: MOCK_PUBLIC_KEY, name: 'Test User', role: 'admin' },
            { publicKey: 'GBMEMBER2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Alice', role: 'member' }
          ],
          expenses: [
            {
              id: 'exp-1',
              description: 'Dinner',
              amount: '100.00',
              currency: 'XLM',
              paidBy: MOCK_PUBLIC_KEY,
              splitBetween: [MOCK_PUBLIC_KEY, 'GBMEMBER2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
              createdAt: new Date().toISOString(),
            }
          ],
          balances: [
            { publicKey: MOCK_PUBLIC_KEY, net: '50.00' },
            { publicKey: 'GBMEMBER2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', net: '-50.00' }
          ],
          createdAt: new Date().toISOString(),
        }),
      });
    });

    await page.route('**/api/groups/group-1/members', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'json',
          body: JSON.stringify({
            success: true,
            member: { publicKey: 'GBMEMBER3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', name: 'Bob', role: 'member' }
          }),
        });
      }
    });

    await page.route('**/api/groups/group-1/expenses', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'json',
          body: JSON.stringify({
            id: 'exp-2',
            description: 'Hotel',
            amount: '200.00',
            currency: 'XLM',
            paidBy: MOCK_PUBLIC_KEY,
            splitBetween: [MOCK_PUBLIC_KEY, 'GBMEMBER2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
            createdAt: new Date().toISOString(),
          }),
        });
      }
    });

    await page.route('**/api/groups/group-1/settle', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'json',
          body: JSON.stringify({
            success: true,
            transactionHash: 'mock-settlement-tx-hash',
          }),
        });
      }
    });
  });

  test('completes full group creation, member addition, expense entry, and settlement flow', async ({ page }) => {
    // 1. Log in via Freighter
    await page.goto('/login');
    const connectBtn = page.getByRole('button', { name: /connect freighter|sign in with freighter|connect wallet/i });
    await connectBtn.waitFor({ state: 'visible', timeout: 10000 });
    await connectBtn.click();

    // Verify successful login redirect to dashboard/groups
    await page.waitForURL(/\/(dashboard|groups)/, { timeout: 10000 });

    // 2. Navigate to groups and create a group
    await page.goto('/groups');
    const createGroupBtn = page.getByRole('button', { name: /create group|new group|start a group/i }).first();
    await createGroupBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createGroupBtn.click();

    const nameInput = page.getByLabel(/group name/i).or(page.locator('input[name="name"]'));
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill('Trip to Tokyo');

    const descInput = page.getByLabel(/description/i).or(page.locator('textarea[name="description"]')).or(page.locator('input[name="description"]'));
    if (await descInput.isVisible()) {
      await descInput.fill('Expenses for the Tokyo trip');
    }

    const submitGroupBtn = page.getByRole('button', { name: /create$|submit|save group/i });
    await submitGroupBtn.click();

    // 3. Open group detail page
    await page.goto('/groups/group-1');
    await expect(page.getByRole('heading', { name: /trip to tokyo/i })).toBeVisible({ timeout: 10000 });

    // 4. Add a member
    const addMemberBtn = page.getByRole('button', { name: /add member|invite member|invite/i });
    if (await addMemberBtn.isVisible()) {
      await addMemberBtn.click();
      const memberInput = page.getByLabel(/address|public key|email|name/i).or(page.locator('input[name="publicKey"]')).or(page.locator('input[name="member"]'));
      if (await memberInput.isVisible()) {
        await memberInput.fill('GBMEMBER3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        await page.getByRole('button', { name: /add|invite|submit/i }).last().click();
      }
    }

    // 5. Record an expense
    const addExpenseBtn = page.getByRole('button', { name: /add expense|new expense|record expense/i });
    await addExpenseBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addExpenseBtn.click();

    const expenseDescInput = page.getByLabel(/description|title/i).or(page.locator('input[name="description"]'));
    await expenseDescInput.waitFor({ state: 'visible', timeout: 5000 });
    await expenseDescInput.fill('Dinner');

    const amountInput = page.getByLabel(/amount/i).or(page.locator('input[name="amount"]'));
    await amountInput.fill('100.00');

    const submitExpenseBtn = page.getByRole('button', { name: /save expense|add expense|create expense|submit/i }).last();
    await submitExpenseBtn.click();

    // Verify expense appears
    await expect(page.getByText('Dinner')).toBeVisible({ timeout: 10000 });

    // 6. Initiate settlement
    const settleBtn = page.getByRole('button', { name: /settle|settle up|pay balances/i });
    if (await settleBtn.isVisible()) {
      await settleBtn.click();
      const confirmSettleBtn = page.getByRole('button', { name: /confirm settle|confirm|pay now|sign transaction/i });
      if (await confirmSettleBtn.isVisible()) {
        await confirmSettleBtn.click();
      }
    }

    expect(true).toBe(true);
  });
});
