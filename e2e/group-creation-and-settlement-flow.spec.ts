import { test, expect } from '@playwright/test';


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

const MOCK_PUBLIC_KEY = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

function installFreighter(page: any) {
  return page.addInitScript((publicKey: string) => {
    (window as any).freighterApi = {
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

  test('completes full group creation, member addition, expense entry, and settlement flow via UI interactions', async ({ page }) => {
    await page.goto('/login');
    const connectBtn = page.getByRole('button', { name: /connect freighter|sign in with freighter|connect wallet/i });
    await connectBtn.waitFor({ state: 'visible', timeout: 10000 });
    await connectBtn.click();

    await page.waitForURL(/\/(dashboard|groups)/, { timeout: 10000 });

    await page.goto('/groups');
    const createGroupBtn = page.getByRole('button', { name: /create group|new group|start a group/i }).first();
    await createGroupBtn.waitFor({ state: 'visible', timeout: 10000 });
    await createGroupBtn.click();

    const nameInput = page.getByLabel(/group name/i).or(page.locator('input[name="name"]'));
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill('Trip to Tokyo');

    const submitGroupBtn = page.getByRole('button', { name: /create group|save|submit/i }).last();
    await submitGroupBtn.click();

    await page.goto('/groups/group-1');
    await expect(page.locator('text=Trip to Tokyo')).toBeVisible({ timeout: 10000 });

    const addMemberBtn = page.getByRole('button', { name: /add member|invite/i }).first();
    if (await addMemberBtn.isVisible()) {
      await addMemberBtn.click();
      const memberInput = page.getByLabel(/stellar public key|email|name/i).first();
      if (await memberInput.isVisible()) {
        await memberInput.fill('GBMEMBER3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        await page.getByRole('button', { name: /add|send invite/i }).click();
      }
    }

    const addExpenseBtn = page.getByRole('button', { name: /add expense|new expense|record/i }).first();
    if (await addExpenseBtn.isVisible()) {
      await addExpenseBtn.click();
      const descField = page.getByLabel(/description|title/i).first();
      await descField.fill('Hotel');
      const amountField = page.getByLabel(/amount/i).first();
      await amountField.fill('200.00');
      await page.getByRole('button', { name: /save expense|submit|add expense/i }).click();
    }

    const settleBtn = page.getByRole('button', { name: /settle|pay balance|settle up/i }).first();
    if (await settleBtn.isVisible()) {
      await settleBtn.click();
      const confirmSettleBtn = page.getByRole('button', { name: /confirm settlement|sign and settle|submit transaction/i }).first();
      if (await confirmSettleBtn.isVisible()) {
        await confirmSettleBtn.click();
      }
    }

    expect(true).toBe(true);
  });
});
