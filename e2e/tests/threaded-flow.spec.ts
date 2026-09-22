import { test, expect, type Page } from '@playwright/test';

/**
 * BDOI end-to-end process, exercised in a real browser across five personas:
 * NB officer screens the client, quotes, sends the proposal, records acceptance and requests placement →
 * insurer places (e-policy received) → NB books → UW head approves (maker-checker) →
 * Claims is blocked by Claims Acceptance Control → Cashier receives premium (official receipt) →
 * Collections clears → claim registers with Preliminary Loss Advice.
 */
const stamp = Date.now().toString().slice(-6);
const CLIENT = `E2E Logistics ${stamp}`;

const nav = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name });
const lastToast = (page: Page) => page.locator('.toast').last();

async function login(page: Page, username: string, password = 'Broker@123') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test('BDOI process: quote → proposal → placement → booking approval → CAC → receipt → claim', async ({ page }) => {
  // 1. New Business officer creates and screens a client
  await login(page, 'nb.officer');
  await expect(page.getByRole('navigation')).not.toContainText('User Access Maintenance');
  await nav(page, /Sanction Screening/).click();
  await page.getByLabel('Name').fill(CLIENT);
  await page.getByLabel('Email').fill(`e2e${stamp}@example.com`);
  await page.getByLabel('TIN').fill(`999-${stamp}`);
  await page.getByRole('button', { name: 'Create & screen' }).click();
  await expect(lastToast(page)).toContainText('screening clear');

  // 2. Quotation with live rating, proposal to client, acceptance, placement request
  await nav(page, /New Business/).click();
  const clientValue = await page.getByLabel('Client').locator('option', { hasText: CLIENT }).getAttribute('value');
  await page.getByLabel('Client').selectOption(clientValue!);
  await page.getByLabel('Product').selectOption({ label: 'MTR-CMP · Motor Comprehensive' });
  await page.getByRole('combobox', { name: /^Insurer/ }).selectOption({ index: 1 });
  await page.getByLabel('Sum insured (₱)').fill('1000000');
  await expect(page.getByTestId('rating')).toContainText('₱12,500.00');
  await expect(page.getByTestId('rating')).toContainText('Total ₱15,656.25');
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await expect(lastToast(page)).toContainText('Quotation created');
  const row = () => page.getByRole('row', { name: new RegExp(CLIENT) }).first();
  await row().getByRole('button', { name: 'Send proposal' }).click();
  await expect(lastToast(page)).toContainText('Proposal emailed');
  await row().getByRole('button', { name: 'Client accepted' }).click();
  await expect(lastToast(page)).toContainText('acceptance recorded');
  await row().getByRole('button', { name: 'Request placement' }).click();
  await expect(lastToast(page)).toContainText('Placement slip sent');
  await expect(page.getByRole('dialog')).toContainText('placement requested');
  const policyNo = (await page.getByRole('dialog').getByRole('heading', { name: /Policy POL-/ }).textContent())!.replace('Policy ', '').trim();
  expect(policyNo).toMatch(/^POL-\d{4}-\d{5}$/);
  await page.getByRole('button', { name: 'Close' }).click();

  // 3. Insurer places (e-policy received) and NB books under maker-checker
  await page.getByRole('button', { name: 'Placement', exact: true }).click();
  const placementRow = page.getByRole('row', { name: new RegExp(policyNo) });
  page.once('dialog', (d) => d.accept('MAL-REF-1'));
  await placementRow.getByRole('button', { name: /Placed \/ e-policy received/ }).click();
  await expect(lastToast(page)).toContainText('E-policy received');
  await placementRow.getByRole('button', { name: 'Book & invoice' }).click();
  await expect(lastToast(page)).toContainText('checker approval');
  await signOut(page);

  // 4. Underwriting head approves the booking
  await login(page, 'uw.head');
  await nav(page, /Approvals & Audit/).click();
  const approvalRow = page.getByRole('row', { name: new RegExp(policyNo) });
  page.once('dialog', (d) => d.accept('Looks good'));
  await approvalRow.getByRole('button', { name: 'Approve' }).click();
  await expect(lastToast(page)).toContainText('approved');
  await signOut(page);

  // 5. Claims Acceptance Control blocks the claim while premium is unpaid
  await login(page, 'claims');
  await nav(page, /Claims/).click();
  await page.getByLabel('Policy number').fill(policyNo);
  await page.getByLabel('Estimated amount (₱)').fill('50000');
  await page.getByLabel('Description').fill('Collision on EDSA northbound');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.locator('.alert.error')).toContainText('Claims Acceptance Control');
  await signOut(page);

  // 6. Cashier receives the full premium over the counter
  await login(page, 'cashier');
  await nav(page, /Operations/).click();
  const invRow = page.getByRole('row', { name: new RegExp(policyNo) });
  await invRow.getByRole('button', { name: 'Receive' }).click();
  await expect(page.getByLabel('Amount (₱)')).toHaveValue('15656.25');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(lastToast(page)).toContainText('Official receipt OR-');
  await nav(page, /Collections/).click();
  await expect(page.getByRole('table').first()).not.toContainText(policyNo);
  await signOut(page);

  // 7. Claim registers with the Preliminary Loss Advice and document checklist
  await login(page, 'claims');
  await nav(page, /Claims/).click();
  await page.getByLabel('Policy number').fill(policyNo);
  await page.getByLabel('Estimated amount (₱)').fill('50000');
  await page.getByLabel('Description').fill('Collision on EDSA northbound');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(lastToast(page)).toContainText('Preliminary Loss Advice');
  await expect(page.getByRole('row', { name: new RegExp(policyNo) })).toContainText('registered');
});

test('entitlement: hand-typed URL outside the persona is refused', async ({ page }) => {
  await login(page, 'cashier');
  await page.goto('/user-access');
  await expect(page.getByText('Not entitled')).toBeVisible();
});
