import { test, expect, type Page } from '@playwright/test';

/**
 * One account threads the whole platform – exercised in a real browser across five personas:
 * NB officer quotes and binds → UW head approves → claims blocked on unpaid premium →
 * cashier receives → collections shows zero balance → claim registers.
 */
const stamp = Date.now().toString().slice(-6);
const CLIENT = `E2E Logistics ${stamp}`;

async function login(page: Page, username: string, password = 'Broker@123') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();
}
const nav = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name });
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test('quote → approve → CAC block → receipt → claim', async ({ page }) => {
  // 1. New Business officer creates and screens a client, then quotes and binds
  await login(page, 'nb.officer');
  await expect(page.getByRole('navigation')).not.toContainText('User Access Maintenance');
  await nav(page, /Sanction Screening/).click();
  await page.getByLabel('Name').fill(CLIENT);
  await page.getByLabel('Email').fill(`e2e${stamp}@example.com`);
  await page.getByLabel('TIN').fill(`999-${stamp}`);
  await page.getByRole('button', { name: 'Create & screen' }).click();
  await expect(page.locator('.toast').last()).toContainText('screening clear');

  await nav(page, /New Business/).click();
  const clientValue = await page.getByLabel('Client').locator('option', { hasText: CLIENT }).getAttribute('value');
  await page.getByLabel('Client').selectOption(clientValue!);
  await page.getByLabel('Product').selectOption({ label: 'MTR-CMP · Motor Comprehensive' });
  await page.getByLabel('Insurer').selectOption({ index: 1 });
  await page.getByLabel('Sum insured (₱)').fill('1000000');
  await expect(page.getByTestId('rating')).toContainText('₱12,500.00');
  await expect(page.getByTestId('rating')).toContainText('Total ₱15,656.25');
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await expect(page.locator('.toast').last()).toContainText('Quotation created');

  const row = page.getByRole('row', { name: new RegExp(CLIENT) }).first();
  await row.getByRole('button', { name: 'Bind & issue' }).click();
  await expect(page.getByRole('dialog')).toContainText('pending approval');
  const policyNo = (await page.getByRole('dialog').getByRole('heading', { name: /Policy POL-/ }).textContent())!.replace('Policy ', '').trim();
  expect(policyNo).toMatch(/^POL-\d{4}-\d{5}$/);
  await page.getByRole('button', { name: 'Close' }).click();
  await signOut(page);

  // 2. Underwriting head approves (maker-checker)
  await login(page, 'uw.head');
  await nav(page, /Approvals & Audit/).click();
  const approvalRow = page.getByRole('row', { name: new RegExp(policyNo) });
  page.once('dialog', (d) => d.accept('Looks good'));
  await approvalRow.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.toast').last()).toContainText('approved');
  await signOut(page);

  // 3. Claims officer is blocked by Claims Acceptance Control while premium is unpaid
  await login(page, 'claims');
  await nav(page, /Claims/).click();
  await page.getByLabel('Policy number').fill(policyNo);
  await page.getByLabel('Estimated amount (₱)').fill('50000');
  await page.getByLabel('Description').fill('Collision on EDSA northbound');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.locator('.alert.error')).toContainText('Claims Acceptance Control');
  await signOut(page);

  // 4. Cashier receives the full premium
  await login(page, 'cashier');
  await nav(page, /Operations/).click();
  const invRow = page.getByRole('row', { name: new RegExp(policyNo) });
  await invRow.getByRole('button', { name: 'Receive' }).click();
  await expect(page.getByLabel('Amount (₱)')).toHaveValue('15656.25');
  await page.getByRole('button', { name: 'Issue receipt' }).click();
  await expect(page.locator('.toast').last()).toContainText('Official receipt OR-');
  await nav(page, /Collections/).click();
  await expect(page.getByRole('table')).not.toContainText(policyNo);
  await signOut(page);

  // 5. Claim now registers and shows in the claims register
  await login(page, 'claims');
  await nav(page, /Claims/).click();
  await page.getByLabel('Policy number').fill(policyNo);
  await page.getByLabel('Estimated amount (₱)').fill('50000');
  await page.getByLabel('Description').fill('Collision on EDSA northbound');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.locator('.toast').last()).toContainText('registered');
  await expect(page.getByRole('row', { name: new RegExp(policyNo) })).toContainText('registered');
});

test('entitlement: hand-typed URL outside the persona is refused', async ({ page }) => {
  await login(page, 'cashier');
  await page.goto('/user-access');
  await expect(page.getByText('Not entitled')).toBeVisible();
});
