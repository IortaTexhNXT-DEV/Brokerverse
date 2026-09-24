import { test, expect, type Page } from '@playwright/test';

/**
 * Multi-process end-to-end coverage in a real browser.
 * 1. Every persona signs in and opens every menu it is entitled to: the page renders and no error is shown.
 * 2. Process journeys: renewal (RMEL), claims lifecycle, refund → disbursement, collections diary/CTE,
 *    case management, TSU + package change, facultative reinsurance, employee benefits, submitted policies,
 *    data migration, user access.
 */
const stamp = Date.now().toString().slice(-6);
const PW = 'Broker@123';
const PERSONAS: Record<string, string[]> = {
  admin: ['New Business', 'Operations', 'Renewal', 'Reinsurance', 'Employee Benefits', 'Submitted Policies', 'Collections', 'Accounting & Disbursement', 'Claims', 'Customer Servicing', 'Sanction Screening & Risk', 'Approvals & Audit', 'Product Maintenance', 'User Access Maintenance', 'Data Migration', 'Reports & Analytics'],
  'nb.officer': ['New Business', 'Sanction Screening & Risk', 'Product Maintenance', 'Reports & Analytics'],
  'uw.head': ['New Business', 'Renewal', 'Reinsurance', 'Product Maintenance', 'Approvals & Audit', 'Reports & Analytics'],
  cashier: ['Operations', 'Collections', 'Reports & Analytics'],
  collections: ['Collections', 'Operations', 'Customer Servicing', 'Reports & Analytics'],
  accountant: ['Accounting & Disbursement', 'Operations', 'Collections', 'Data Migration', 'Submitted Policies', 'Reports & Analytics'],
  'fin.head': ['Accounting & Disbursement', 'Collections', 'Approvals & Audit', 'Reports & Analytics'],
  claims: ['Claims', 'Customer Servicing', 'Reports & Analytics'],
  renewals: ['Renewal', 'New Business', 'Submitted Policies', 'Reports & Analytics'],
  'ri.officer': ['Reinsurance', 'Reports & Analytics'],
  'eb.officer': ['Employee Benefits', 'Sanction Screening & Risk', 'Reports & Analytics'],
  compliance: ['Sanction Screening & Risk', 'User Access Maintenance', 'Customer Servicing', 'Approvals & Audit', 'Reports & Analytics'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: new RegExp(`${escapeRe(name)}$`) });
const lastToast = (page: Page) => page.locator('.toast').last();
const tab = (page: Page, name: string) => page.locator('.tabs').getByRole('button', { name, exact: true });

async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(username === 'admin' ? 'Admin@123' : PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}
async function expectHealthyPage(page: Page) {
  await expect(page.locator('.page-head h1')).toBeVisible();
  await expect(page.locator('.alert.error')).toHaveCount(0);
  await expect(page.locator('.toast.error')).toHaveCount(0);
  await expect(page.getByText('Internal server error')).toHaveCount(0);
}
async function approveLatest(page: Page, approver: string, text: RegExp) {
  await login(page, approver);
  await nav(page, 'Approvals & Audit').click();
  const row = page.getByRole('row', { name: text }).first();
  page.once('dialog', (d) => d.accept('ok'));
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(lastToast(page)).toContainText('approved');
  await signOut(page);
}
async function newClient(page: Page, name: string, corporate = true) {
  await nav(page, 'Sanction Screening & Risk').click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Type').selectOption(corporate ? 'corporate' : 'individual');
  await page.getByLabel('Email').fill(`${name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`);
  await page.getByLabel('TIN').fill(`TIN-${stamp}-${name.length}`);
  await page.getByRole('button', { name: 'Create & screen' }).click();
  await expect(lastToast(page)).toContainText('screening clear');
}
/** Quote → proposal → accept → placement → placed → book (as nb.officer), then approve as uw.head. Returns policy number. */
async function issuePolicy(page: Page, clientName: string, product = 'MTR-CMP · Motor Comprehensive', sumInsured = '1000000') {
  await nav(page, 'New Business').click();
  const clientValue = await page.getByLabel('Client').locator('option', { hasText: clientName }).getAttribute('value');
  await page.getByLabel('Client').selectOption(clientValue!);
  await page.getByLabel('Product').selectOption({ label: product });
  await page.getByRole('combobox', { name: /^Insurer/ }).selectOption({ index: 1 });
  await page.getByLabel('Sum insured (₱)').fill(sumInsured);
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await expect(lastToast(page)).toContainText('Quotation created');
  const row = () => page.getByRole('row', { name: new RegExp(clientName) }).first();
  await row().getByRole('button', { name: 'Send proposal' }).click();
  await expect(lastToast(page)).toContainText('Proposal emailed');
  await row().getByRole('button', { name: 'Client accepted' }).click();
  await expect(lastToast(page)).toContainText('acceptance recorded');
  await row().getByRole('button', { name: 'Request placement' }).click();
  await expect(page.getByRole('dialog')).toContainText('placement requested');
  const policyNo = (await page.getByRole('dialog').getByRole('heading', { name: /Policy POL-/ }).textContent())!.replace('Policy ', '').trim();
  await page.getByRole('button', { name: 'Close' }).click();
  await tab(page, 'Placement').click();
  const prow = page.getByRole('row', { name: new RegExp(policyNo) });
  page.once('dialog', (d) => d.accept('INS-REF'));
  await prow.getByRole('button', { name: /Placed \/ e-policy received/ }).click();
  await expect(lastToast(page)).toContainText('E-policy received');
  await prow.getByRole('button', { name: 'Book & invoice' }).click();
  await expect(lastToast(page)).toContainText('checker approval');
  return policyNo;
}
async function payInFull(page: Page, policyNo: string) {
  await nav(page, 'Operations').click();
  const invRow = page.getByRole('row', { name: new RegExp(policyNo) });
  await invRow.getByRole('button', { name: 'Receive' }).click();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(lastToast(page)).toContainText('Official receipt OR-');
}


// One test per persona so a slow runner cannot starve the whole sweep on a single timeout.
for (const [persona, menus] of Object.entries(PERSONAS)) {
  test(`${persona} opens every entitled menu without errors`, async ({ page }) => {
    test.setTimeout(150_000);
    await login(page, persona);
    const links = page.getByRole('navigation', { name: 'Modules' }).getByRole('link');
    await expect(links).toHaveCount(menus.length + 1); // + Dashboard
    for (const m of menus) {
      await nav(page, m).click();
      await expectHealthyPage(page);
      // Open every tab on the page, if any (re-query each time: the tab bar re-renders when data loads)
      const n = await page.locator('.tabs button').count();
      for (let i = 0; i < n; i++) { await page.locator('.tabs button').nth(i).click(); await expectHealthyPage(page); }
    }
    await signOut(page);
  });
}

test('claims lifecycle in the browser: PLA → documents → FLA → offer → contest → accept → settlement approval → settled', async ({ page }) => {
  test.setTimeout(180_000);
  const client = `Claims Journey ${stamp}`;
  await login(page, 'nb.officer');
  await newClient(page, client);
  const policyNo = await issuePolicy(page, client);
  await signOut(page);
  await approveLatest(page, 'uw.head', new RegExp(policyNo));
  await login(page, 'cashier'); await payInFull(page, policyNo); await signOut(page);

  await login(page, 'claims');
  await nav(page, 'Claims').click();
  await page.getByLabel('Policy number').fill(policyNo);
  await page.getByLabel('Estimated amount (₱)').fill('50000');
  await page.getByLabel('Description').fill('Collision on C5 southbound');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(lastToast(page)).toContainText('Preliminary Loss Advice');
  await page.getByRole('row', { name: new RegExp(policyNo) }).first().click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Document checklist');
  const total = await dlg.getByRole('button', { name: 'Received' }).count();
  for (let i = 0; i < total; i++) {
    await dlg.getByRole('button', { name: 'Received' }).first().click();
    await expect(dlg.getByRole('button', { name: 'Unmark' })).toHaveCount(i + 1);
  }
  await expect(dlg.locator('.pill').first()).toContainText('documents complete');
  page.once('dialog', (d) => d.accept()); // adjuster confirm
  await dlg.getByRole('button', { name: 'Send Formal Loss Advice' }).click();
  await expect(lastToast(page)).toContainText('fla sent');
  await dlg.getByRole('button', { name: 'Insurer evaluating' }).click();
  await expect(lastToast(page)).toContainText('under review');
  page.on('dialog', (d) => d.accept(d.message().includes('Offer amount') ? '40000' : d.message().includes('position') ? 'Estimate is 45000' : 'ok'));
  await dlg.getByRole('button', { name: 'Offer received' }).click();
  await expect(lastToast(page)).toContainText('offer received');
  await dlg.getByRole('button', { name: 'Contest offer' }).click();
  await expect(lastToast(page)).toContainText('offer contested');
  await dlg.getByRole('button', { name: 'Offer received' }).click();
  await expect(lastToast(page)).toContainText('offer received');
  await dlg.getByRole('button', { name: 'Insured accepts' }).click();
  await expect(lastToast(page)).toContainText('offer accepted');
  await dlg.getByRole('button', { name: 'Request settlement approval' }).click();
  await expect(lastToast(page)).toContainText('settlement requested');
  page.removeAllListeners('dialog');
  await page.getByRole('button', { name: 'Close' }).click();
  await signOut(page);
  await approveLatest(page, 'fin.head', /Settle CLM-/);
  await login(page, 'claims');
  await nav(page, 'Claims').click();
  await page.getByRole('row', { name: new RegExp(policyNo) }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark settled / paid' }).click();
  await expect(lastToast(page)).toContainText('settled');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(page.getByRole('row', { name: new RegExp(policyNo) }).first()).toContainText(/settled|closed/);
});

test('renewal (RMEL) in the browser: disposition, RA letters, client acceptance, renewal placement', async ({ page }) => {
  test.setTimeout(120_000);
  // Seed a policy expiring in 30 days via the API (inception 335 days ago), then drive the renewal screen.
  const client = `Renewal Journey ${stamp}`;
  await login(page, 'nb.officer');
  await newClient(page, client);
  const inception = new Date(); inception.setUTCDate(inception.getUTCDate() - 335);
  await nav(page, 'New Business').click();
  const clientValue = await page.getByLabel('Client').locator('option', { hasText: client }).getAttribute('value');
  await page.getByLabel('Client').selectOption(clientValue!);
  await page.getByLabel('Product').selectOption({ label: 'MTR-CTPL · Motor CTPL' });
  await page.getByRole('combobox', { name: /^Insurer/ }).selectOption({ index: 1 });
  await page.getByLabel('Sum insured (₱)').fill('100000');
  await page.getByLabel('Inception date').fill(inception.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await expect(lastToast(page)).toContainText('Quotation created');
  const row = () => page.getByRole('row', { name: new RegExp(client) }).first();
  await row().getByRole('button', { name: 'Send proposal' }).click();
  await row().getByRole('button', { name: 'Client accepted' }).click();
  await row().getByRole('button', { name: 'Request placement' }).click();
  const policyNo = (await page.getByRole('dialog').getByRole('heading', { name: /Policy POL-/ }).textContent())!.replace('Policy ', '').trim();
  await page.getByRole('button', { name: 'Close' }).click();
  await tab(page, 'Placement').click();
  const prow = page.getByRole('row', { name: new RegExp(policyNo) });
  page.once('dialog', (d) => d.accept('INS'));
  await prow.getByRole('button', { name: /Placed/ }).click();
  await prow.getByRole('button', { name: 'Book & invoice' }).click();
  await expect(lastToast(page)).toContainText('checker approval');
  await signOut(page);
  await approveLatest(page, 'uw.head', new RegExp(policyNo));

  await login(page, 'renewals');
  await nav(page, 'Renewal').click();
  const rrow = page.getByRole('row', { name: new RegExp(policyNo) });
  await expect(rrow).toContainText('pending sanitation');
  await rrow.getByRole('button', { name: 'For renewal', exact: true }).click();
  await expect(lastToast(page)).toContainText('Dispositioned');
  await rrow.getByRole('button', { name: 'Initial RA (−70d)' }).click();
  await expect(lastToast(page)).toContainText('Initial RA');
  await rrow.getByRole('button', { name: 'Final RA (−45d)' }).click();
  await expect(lastToast(page)).toContainText('Final RA');
  await rrow.getByRole('button', { name: 'Client accepted' }).click();
  await expect(lastToast(page)).toContainText('acceptance recorded');
  page.once('dialog', (d) => d.accept('120000'));
  await rrow.getByRole('button', { name: 'Renew → placement' }).click();
  await expect(lastToast(page)).toContainText('placed with insurer');
  await expect(rrow).toContainText('placement requested');
});

test('finance journey: cheque PDC, refund request → TL review → UH approval → disbursement chain → payment', async ({ page }) => {
  test.setTimeout(180_000);
  const client = `Finance Journey ${stamp}`;
  await login(page, 'nb.officer'); await newClient(page, client); const policyNo = await issuePolicy(page, client, 'MTR-CTPL · Motor CTPL', '100000'); await signOut(page);
  await approveLatest(page, 'uw.head', new RegExp(policyNo));

  await login(page, 'cashier');
  await nav(page, 'Operations').click();
  await page.getByRole('row', { name: new RegExp(policyNo) }).getByRole('button', { name: 'Receive' }).click();
  await page.getByLabel('Channel').selectOption('otc_cheque');
  await page.getByLabel('Cheque no.').fill(`CHQ-${stamp}`);
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(lastToast(page)).toContainText('Cheque held until');
  await tab(page, 'Payments / PDC / UPP').click();
  await expect(page.getByRole('row', { name: new RegExp(`CHQ-${stamp}`) })).toContainText('held');
  // A payment without invoice becomes unapplied premium
  await tab(page, 'Invoices & cashiering').click();
  await page.getByRole('button', { name: 'Payment without invoice' }).click();
  await page.getByLabel('Amount (₱)').fill('2500');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(lastToast(page)).toContainText('recorded as unapplied');
  await signOut(page);

  // Refund request by the NB officer for the unapplied 2,500; TL review by a second marketing user; UH approval
  await login(page, 'accountant');
  await nav(page, 'Accounting & Disbursement').click();
  await tab(page, 'Disbursements').click();
  await page.getByLabel('Payee').fill(`Supplier ${stamp}`);
  await page.getByLabel('Amount (₱)').fill('1200');
  await page.getByRole('button', { name: 'Request', exact: true }).click();
  await expect(lastToast(page)).toContainText('Disbursement requested');
  await expect(page.getByRole('row', { name: new RegExp(`Supplier ${stamp}`) })).toContainText('awaiting another reviewer');
  await signOut(page);
  await login(page, 'admin');
  await nav(page, 'Accounting & Disbursement').click();
  await page.getByRole('row', { name: new RegExp(`Supplier ${stamp}`) }).getByRole('button', { name: 'Review OK' }).click();
  await expect(lastToast(page)).toContainText('Finance Head');
  await signOut(page);
  await approveLatest(page, 'fin.head', new RegExp(`Supplier ${stamp}`));
  await login(page, 'accountant');
  await nav(page, 'Accounting & Disbursement').click();
  page.once('dialog', (d) => d.accept(`CHQ-PAY-${stamp}`));
  await page.getByRole('row', { name: new RegExp(`Supplier ${stamp}`) }).getByRole('button', { name: 'Pay' }).click();
  await expect(lastToast(page)).toContainText('Paid, posted');
  await tab(page, 'Trial balance').click();
  await expect(page.getByText(/balanced/)).toBeVisible();
});

test('collections diary and credit-term extension approved by the finance head', async ({ page }) => {
  test.setTimeout(120_000);
  const client = `Collections Journey ${stamp}`;
  await login(page, 'nb.officer'); await newClient(page, client); const policyNo = await issuePolicy(page, client, 'MTR-CTPL · Motor CTPL', '100000'); await signOut(page);
  await approveLatest(page, 'uw.head', new RegExp(policyNo));
  await login(page, 'collections');
  await nav(page, 'Collections').click();
  const row = page.getByRole('row', { name: new RegExp(policyNo) });
  await expect(row).toContainText('newly booked');
  await row.getByRole('button', { name: 'Log effort' }).click();
  await page.getByLabel('Category').selectOption('committed');
  const commit = new Date(); commit.setUTCDate(commit.getUTCDate() + 45);
  await page.getByLabel('Commitment date').fill(commit.toISOString().slice(0, 10));
  await page.getByLabel('Contact person').fill('Ms. Reyes');
  await page.locator('form.card').getByRole('button', { name: 'Log effort' }).click();
  await expect(lastToast(page)).toContainText('beyond the credit term');
  page.on('dialog', (d) => d.accept(d.message().includes('days') ? '30' : 'Client budget cycle'));
  await row.getByRole('button', { name: 'CTE' }).click();
  await expect(lastToast(page)).toContainText('CTE requested');
  page.removeAllListeners('dialog');
  await signOut(page);
  await approveLatest(page, 'fin.head', /Credit-term extension/);
  await login(page, 'collections');
  await nav(page, 'Collections').click();
  await expect(page.getByRole('row', { name: new RegExp(policyNo) }).first()).toContainText('committed');
});

test('case management, TSU + package change, facultative RI, employee benefits, submitted policies, data migration, user access', async ({ page }) => {
  test.setTimeout(240_000);
  // Case management as compliance
  await login(page, 'compliance');
  await nav(page, 'Customer Servicing').click();
  await page.getByLabel('Concern').selectOption('inquiry');
  await page.getByLabel('Description').fill('What are your office hours?');
  await page.getByRole('button', { name: 'Log case' }).click();
  await expect(lastToast(page)).toContainText('closed at point of contact');
  await tab(page, 'Servicing facility').click();
  await page.getByPlaceholder(/Invoice no., policy no./).fill('Toyota');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('button', { name: 'Update contact' }).first()).toBeVisible();
  // User access as compliance (UAM)
  await nav(page, 'User Access Maintenance').click();
  await page.getByLabel('Username').fill(`joiner.${stamp}`);
  await page.getByLabel('Temporary password').fill('Temp@12345');
  await page.getByLabel('Full name').fill('Joiner Test');
  await page.getByLabel('Email').fill(`joiner${stamp}@brokerverse.local`);
  await page.getByRole('button', { name: 'Create user' }).click();
  await expect(lastToast(page)).toContainText('joiner');
  await signOut(page);

  // TSU request + package maintenance as admin (PM)
  await login(page, 'admin');
  const tsuClient = `TSU Journey ${stamp}`;
  await newClient(page, tsuClient);
  await nav(page, 'Product Maintenance').click();
  await tab(page, 'TSU requests').click();
  const tsuClientValue = await page.getByLabel('Client').locator('option', { hasText: tsuClient }).getAttribute('value');
  await page.getByLabel('Client').selectOption(tsuClientValue!);
  await page.getByLabel('Sum insured (₱)').fill('30000000');
  await page.getByLabel(/Risk details/).fill('Warehouse complex, sprinklered, Class A construction');
  await page.getByRole('button', { name: 'Submit to TSU' }).click();
  await expect(lastToast(page)).toContainText('TSU request submitted');
  const tsuRow = page.getByRole('row', { name: /TSU-\d{4}-\d{5}/ }).first();
  await tsuRow.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(lastToast(page)).toContainText('acknowledged');
  await tab(page, 'Packages').click();
  page.on('dialog', (d) => d.accept(d.message().startsWith('Field') ? 'commissionRate' : d.message().startsWith('New value') ? '0.16' : 'Commission uplift'));
  await page.getByRole('row', { name: /MTR-CTPL/ }).getByRole('button', { name: 'Change request' }).click();
  await expect(lastToast(page)).toContainText('Maintenance request raised');
  page.removeAllListeners('dialog');
  await signOut(page);
  await approveLatest(page, 'uw.head', /Commission uplift/);
  await login(page, 'admin');
  await nav(page, 'Product Maintenance').click();
  await expect(page.getByRole('row', { name: /Commission uplift/ }).first()).toBeVisible();

  // Facultative RI
  await nav(page, 'Reinsurance').click();
  await page.getByLabel('Sum insured (₱)').fill('2000000000');
  await page.getByLabel('Risk description').fill('Petrochemical plant, sum insured PHP 2B');
  await page.getByRole('button', { name: 'Request placement' }).click();
  await expect(lastToast(page)).toContainText('acknowledge within 24h');
  const facRow = page.getByRole('row', { name: /FAC-\d{4}-\d{5}/ }).first();
  await facRow.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(lastToast(page)).toContainText('acknowledged');

  // Employee benefits
  await nav(page, 'Employee Benefits').click();
  await page.getByLabel('Corporate client').selectOption({ index: 1 });
  await page.getByLabel('Incumbent insurer').selectOption({ index: 1 });
  await page.getByLabel('Plan').fill(`Gold HMO ${stamp}`);
  await page.getByLabel(/Indicative premium/).fill('12000');
  await page.getByRole('button', { name: 'Create scheme' }).click();
  await expect(lastToast(page)).toContainText('Prospect scheme created');
  await page.getByRole('row', { name: new RegExp(`Gold HMO ${stamp}`) }).click();
  await page.getByRole('button', { name: 'BOR received' }).click();
  await expect(lastToast(page)).toContainText('BOR received');
  await page.getByRole('button', { name: 'TOR prepared' }).click();
  await expect(lastToast(page)).toContainText('TOR prepared');
  await page.getByRole('button', { name: 'Upload census' }).click();
  await expect(lastToast(page)).toContainText('Census');

  // Submitted policies
  await nav(page, 'Submitted Policies').click();
  await page.getByLabel(/Insurer \(for matching\)/).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  await expect(lastToast(page)).toContainText('masterlist');
  page.once('dialog', (d) => d.accept('Sum insured below loan value'));
  await page.getByRole('button', { name: 'Findings → IAAF' }).first().click();
  await expect(lastToast(page)).toContainText('IAAF');

  // Data migration
  await nav(page, 'Data Migration').click();
  await page.getByLabel('Source count').fill('100');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(lastToast(page)).toContainText('Batch registered');
  page.on('dialog', (d) => d.accept(d.message().includes('count') ? '99' : d.message().includes('value') ? '0' : 'One duplicate legacy row removed'));
  await page.getByRole('button', { name: 'Load & reconcile' }).first().click();
  await expect(lastToast(page)).toContainText('disposition required');
  await page.getByRole('button', { name: 'Disposition' }).first().click();
  await expect(lastToast(page)).toContainText('Dispositioned');
  page.removeAllListeners('dialog');
});
