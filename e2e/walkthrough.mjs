/**
 * Process-flow walkthrough capture: drives every BDOI process in a real browser with the responsible
 * personas and writes one screenshot per step plus manifest.json to docs/process-walkthrough.
 * Requires a running platform (API + web) seeded with demo data:  BASE_URL=http://localhost:5173 node e2e/walkthrough.mjs
 * Then build the page with `node scripts/build-walkthrough.mjs` (or simply `npm run walkthrough`).
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/process-walkthrough');
rmSync(`${OUT}/shots`, { recursive: true, force: true });
const stamp = Date.now().toString().slice(-5);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);

// Prompt answers: first matching regex wins; confirms are accepted.
let answers = [];
page.on('dialog', (d) => { const m = d.message(); const hit = answers.find(([re]) => re.test(m)); d.accept(hit ? hit[1] : 'ok'); });

const S = []; let cur;
const proc = (id, title, pdf, persona, summary) => { cur = { id, title, pdf, persona, summary, steps: [], errors: [] }; S.push(cur); mkdirSync(`${OUT}/shots/${id}`, { recursive: true }); };
async function shot(step, screen, note = '') {
  await page.waitForTimeout(500);
  const n = String(cur.steps.length + 1).padStart(2, '0');
  const file = `shots/${cur.id}/${n}.jpg`;
  await page.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 78 });
  cur.steps.push({ n, step, screen, note, file });
  console.log(`${cur.id} ${n} ${step}`);
}
async function attempt(label, fn) { try { await fn(); } catch (e) { const msg = String(e).split('\n')[0]; cur.errors.push(`${label}: ${msg}`); console.log(`  !! ${cur.id} ${label}: ${msg}`); } }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nav = (name) => page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: new RegExp(`${esc(name)}$`) });
const tab = (name) => page.locator('.tabs').getByRole('button', { name, exact: true });
const toast = () => page.locator('.toast').last();
const row = (re) => page.getByRole('row', { name: re }).first();
const dlg = () => page.getByRole('dialog');
async function login(u) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Username').fill(u); await page.getByLabel('Password').fill(u === 'admin' ? 'Admin@123' : 'Broker@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: /Good day/ }).waitFor();
}
async function signOut() { try { await page.getByRole('button', { name: 'Sign out' }).click({ timeout: 3000 }); } catch { await page.goto(`${BASE}/login`); } }
async function as(u, fn) { await login(u); try { await fn(); } finally { await signOut(); } }
async function expectToast(re) { await page.locator('.toast', { hasText: re }).last().waitFor(); }
async function newClient(name, withShots = false) {
  await nav('Sanction Screening & Risk').click();
  await page.getByLabel('Name').fill(name); await page.getByLabel('Type').selectOption('corporate');
  await page.getByLabel('Email').fill(`${name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`); await page.getByLabel('TIN').fill(`TIN-${stamp}-${name.length}`);
  if (withShots) await shot('MAO creates the client in Broker; KYC details captured', 'Sanction Screening & Risk › New client form');
  await page.getByRole('button', { name: 'Create & screen' }).click(); await expectToast(/screening clear/);
  if (withShots) await shot('Client is sanction-screened automatically (clear / hit) and risk-tiered', 'Sanction Screening & Risk › Client register', 'Screening result and CDD level shown on the row');
}
/** Quote → proposal → accept → placement → placed → book. Returns policy no. */
async function issuePolicy(client, product = 'MTR-CMP · Motor Comprehensive', si = '1000000', opts = {}) {
  await nav('New Business').click();
  const v = await page.getByLabel('Client').locator('option', { hasText: client }).getAttribute('value');
  await page.getByLabel('Client').selectOption(v); await page.getByLabel('Product').selectOption({ label: product });
  await page.getByRole('combobox', { name: /^Insurer/ }).selectOption({ index: 1 }); await page.getByLabel('Sum insured (₱)').fill(si);
  if (opts.inception) await page.getByLabel('Inception date').fill(opts.inception);
  if (opts.shots) await shot('Quotation prepared with the rating engine (premium, VAT, DST, LGT, commission)', 'New Business › Quotations & proposals › New quotation form');
  await page.getByRole('button', { name: 'Create quotation' }).click(); await expectToast(/Quotation created/);
  if (opts.shots) await shot('Quotation created (status: quoted); hold cover can be requested from the insurer', 'New Business › Quotations & proposals');
  const r = () => row(new RegExp(client));
  await r().getByRole('button', { name: 'Send proposal' }).click(); await expectToast(/Proposal emailed/);
  if (opts.shots) await shot('Proposal sent to the client by email (status: proposal sent)', 'New Business › Quotations & proposals › Send proposal');
  await r().getByRole('button', { name: 'Client accepted' }).click(); await expectToast(/acceptance recorded/);
  if (opts.shots) await shot('Client acceptance recorded (Y); a decline with reason is the N branch', 'New Business › Quotations & proposals › Client accepted');
  await r().getByRole('button', { name: 'Request placement' }).click(); await dlg().getByRole('heading', { name: /Policy POL-/ }).waitFor();
  const policyNo = (await dlg().getByRole('heading', { name: /Policy POL-/ }).textContent()).replace('Policy ', '').trim();
  if (opts.shots) await shot('Placement requested: placement slip goes to the insurer via SFTP or email', 'New Business › Policy drawer (placement requested)');
  await page.getByRole('button', { name: 'Close' }).click(); await tab('Placement').click();
  if (opts.shots) await shot('Placement board tracks slips awaiting the insurer, returns and e-policies', 'New Business › Placement');
  const p = row(new RegExp(policyNo));
  answers = [[/insurer|ref/i, `INS-${stamp}`]];
  await p.getByRole('button', { name: /Placed \/ e-policy received/ }).click(); await expectToast(/E-policy received/);
  if (opts.shots) await shot('Insurer placed the risk; e-policy received (COG via SFTP or PO email)', 'New Business › Placement › Placed / e-policy received');
  await p.getByRole('button', { name: 'Book & invoice' }).click(); await expectToast(/checker approval/);
  if (opts.shots) await shot('Booking and invoicing raised for checker approval (maker-checker)', 'New Business › Placement › Book & invoice');
  return policyNo;
}
async function approve(user, re, opts = {}) {
  await as(user, async () => {
    await nav('Approvals & Audit').click();
    if (opts.shots) await shot(opts.before ?? 'Checker sees the pending request in the approval queue', 'Approvals & Audit › Pending');
    answers = [[/note|comment/i, 'Reviewed and approved']];
    await row(re).getByRole('button', { name: 'Approve' }).click(); await expectToast(/approved/);
    if (opts.shots) await shot(opts.after ?? 'Checker approves; the system posts the downstream entries', 'Approvals & Audit › Approve');
  });
}
async function payCheque(policyNo, shots = false) {
  await nav('Operations').click();
  if (shots) await shot('Cashiering: open invoices (premium receivables) awaiting payment', 'Operations › Invoices & cashiering');
  await row(new RegExp(policyNo)).getByRole('button', { name: 'Receive' }).click();
  await page.getByLabel('Channel').selectOption('otc_cheque'); await page.getByLabel('Cheque no.').fill(`CHQ-${stamp}`);
  if (shots) await shot('Receive payment: channel (bills payment, OTC cash/cheque, batch files, autopay) and reference', 'Operations › Invoices & cashiering › Receive');
  await page.getByRole('button', { name: 'Record payment' }).click(); await expectToast(/Cheque held until/);
  if (shots) await shot('Cheque payment recorded and held for the 4-day clearing period', 'Operations › Receive › Record payment');
  await tab('Payments / PDC / UPP').click();
  if (shots) await shot('PDC register: held cheques, matured, bounced (exclusion list) and unapplied premium', 'Operations › Payments / PDC / UPP');
  if (shots) await shot('Held cheque shows Matured / Bounced actions once the 4-day hold lapses', 'Operations › Payments / PDC / UPP › Held cheque');
  await tab('Invoices & cashiering').click();
  await row(new RegExp(policyNo)).getByRole('button', { name: 'Receive' }).click();
  await page.getByRole('button', { name: 'Record payment' }).click(); await expectToast(/Official receipt OR-/);
  if (shots) await shot('Cash / bills payment applied in full: official receipt issued and receivable cleared', 'Operations › Receive › Official receipt');
}

let policyA, policyB, policyC, policyD;
// ───────────────────────── P02 New Business
proc('02-new-business', 'New Business', 'NEW BUSINESS.pdf', 'nb.officer → uw.head', 'Client creation and screening, quotation, proposal, placement to the insurer, e-policy and booking under maker-checker.');
await attempt('nb', async () => {
  await as('nb.officer', async () => {
    await newClient(`Acme Freight ${stamp}`, true);
    policyA = await issuePolicy(`Acme Freight ${stamp}`, 'MTR-CMP · Motor Comprehensive', '1000000', { shots: true });
  });
  await approve('uw.head', new RegExp(policyA), { shots: true, before: 'Underwriting Head (checker) reviews the booking request', after: 'Booking approved: invoice, journal and e-policy dispatch are posted automatically' });
  await as('nb.officer', async () => {
    await nav('New Business').click(); await tab('Policies').click();
    await shot('Policy register: the policy is in force with its invoice and e-policy channel', 'New Business › Policies');
    await row(new RegExp(policyA)).click(); await dlg().waitFor();
    await shot('Policy detail: placement history, e-policy status and the exception route to the contact centre', 'New Business › Policies › Policy detail');
    await page.getByRole('button', { name: 'Close' }).first().click();
  });
});

// ───────────────────────── P03 Operations
proc('03-operations', 'Operations', 'OPERATIONS PROCESS FLOW.pdf', 'cashier → checker', 'Cashiering channels, post-dated cheque hold, unapplied premium, direct payments with commission receivables, adjustments and production reconciliation.');
await attempt('ops', async () => {
  await as('nb.officer', async () => { await newClient(`Direct Pay Co ${stamp}`); policyD = await issuePolicy(`Direct Pay Co ${stamp}`, 'MTR-CTPL · Motor CTPL', '100000'); });
  await approve('uw.head', new RegExp(policyD));
  await as('cashier', async () => {
    await payCheque(policyA, true);
    await tab('Invoices & cashiering').click();
    await page.getByRole('button', { name: 'Payment without invoice' }).click(); await page.getByLabel('Amount (₱)').fill('2500');
    await shot('Payment with zero PR / payment greater than PR is recorded without an invoice', 'Operations › Invoices & cashiering › Payment without invoice');
    await page.getByRole('button', { name: 'Record payment' }).click(); await expectToast(/unapplied/);
    await tab('Payments / PDC / UPP').click();
    await shot('The amount sits in Unapplied Premium (GL 2400) until applied to an invoice', 'Operations › Payments / PDC / UPP');
    await tab('Direct payments').click();
    await page.getByPlaceholder(/paid directly to insurer/).fill(policyD);
    await shot('Direct payment to insurer identified for a booked policy', 'Operations › Direct payments › Identify');
    await page.getByRole('button', { name: 'Identify direct payment' }).click(); await expectToast(/commission receivable/);
    const dr = () => row(new RegExp(policyD));
    await dr().getByRole('button', { name: 'Bill insurer' }).click(); await expectToast(/Updated/);
    await shot('Commission receivable (GL 1250) billed to the insurer; follow-up until collected', 'Operations › Direct payments › Bill insurer');
    await dr().getByRole('button', { name: 'Insurer approved' }).click(); await expectToast(/Updated/);
    await dr().getByRole('button', { name: /Collect/ }).click(); await expectToast(/Updated/);
    await shot('Commission collected: commission official receipt issued', 'Operations › Direct payments › Collect (commission OR)');
    await tab('Adjustments').click();
    await page.getByLabel('Policy no.').fill(policyA); await page.getByLabel('Type').selectOption('adjustment');
    await page.getByLabel('Premium delta (₱)').fill('-3000'); await page.getByLabel('Refund to client (₱)').fill('1500'); await page.getByLabel('Description').fill('Premium adjustment: sum insured reduced per client request');
    await shot('Adjustment / cancellation validated by the Adjustment Team and routed to the checker-poster', 'Operations › Adjustments › Endorsement form');
    await page.getByRole('button', { name: 'Submit for posting' }).click(); await expectToast(/approval|posting|Endorsement/i);
    await shot('Endorsement pending checker approval; a refund creates a Refund Request Form (RRF) on approval', 'Operations › Adjustments');
    await tab('Production recon').click();
    await page.locator('.card', { hasText: 'Match & classify' }).locator('select').first().selectOption({ index: 1 });
    await page.getByLabel(/Rows: policy no/).fill(`${policyA}, 12500, INS-${stamp}\nPOL-9999-00001, 8000, INS-X`);
    await shot('Production reconciliation: insurer production file matched against booked policies', 'Operations › Production recon › Upload');
    await page.getByRole('button', { name: 'Match & classify' }).click(); await page.locator('.toast', { hasText: /matched/ }).last().waitFor();
    await shot('Rows classified as matched, with discrepancies, or unbooked; each gets a disposition', 'Operations › Production recon › Result');
  });
  await approve('admin', new RegExp(policyA), { shots: true, before: 'Checker-poster reviews the endorsement', after: 'Endorsement posted: premium and commission reversed, RRF raised for the refund' });
});

// ───────────────────────── P04 Marketing Collections
proc('04-marketing-collections', 'Marketing Collections', 'MARKETING COLLECTIONS - Process Flow.pdf', 'collections → fin.head', 'Premium receivable list by stage, marketing diary, credit-term extension under approval and statement of account.');
await attempt('clxn', async () => {
  await as('nb.officer', async () => { await newClient(`Bayan Traders ${stamp}`); policyB = await issuePolicy(`Bayan Traders ${stamp}`, 'MTR-CTPL · Motor CTPL', '100000'); });
  await approve('uw.head', new RegExp(policyB));
  await as('collections', async () => {
    await nav('Collections').click();
    await shot('PR list: newly booked accounts to collect within 10–15 days; ageing and collection stage per invoice', 'Collections › Outstanding premium');
    const r = () => row(new RegExp(policyB));
    await r().getByRole('button', { name: 'SOA' }).click(); await page.getByRole('heading', { name: /Statement of account/ }).waitFor();
    await shot('Statement of account sent to the client', 'Collections › SOA');
    await page.getByRole('heading', { name: /Statement of account/ }).locator('..').getByRole('button', { name: 'Close' }).click();
    await r().getByRole('button', { name: 'Log effort' }).click();
    await page.getByLabel('Category').selectOption('committed');
    const c = new Date(); c.setUTCDate(c.getUTCDate() + 45); await page.getByLabel('Commitment date').fill(c.toISOString().slice(0, 10));
    await page.getByLabel('Contact person').fill('Ms. Reyes');
    await shot('Marketing diary: when / where / how / what of each collection effort, commitment date and arrangement', 'Collections › Log effort');
    await page.locator('form.card').getByRole('button', { name: 'Log effort' }).click(); await expectToast(/beyond the credit term/);
    await shot('Commitment beyond the 60-day credit term: MAO informed, tagged as committed', 'Collections › Outstanding premium');
    answers = [[/days/i, '30'], [/reason|why/i, 'Client budget cycle']];
    await r().getByRole('button', { name: 'CTE' }).click(); await expectToast(/CTE requested/);
    await shot('Credit-term extension (CTE) requested for Unit Head approval', 'Collections › CTE');
    await r().getByRole('button', { name: 'Diary' }).click(); await page.getByRole('heading', { name: /^Diary/ }).waitFor();
    await shot('Effort diary per invoice with category tagging', 'Collections › Diary');
  });
  await approve('fin.head', /Credit-term extension/, { shots: true, before: 'Unit / Finance Head reviews the CTE request', after: 'CTE approved: due date extended and account stays within term' });
});

// ───────────────────────── P05 FRBS Accounting
proc('05-frbs-accounting', 'FRBS Accounting', 'FRBS - ACCOUNTING.pdf', 'accountant → fin.head', 'Chart of accounts, system-generated journals, manual entries under review, trial balance, period and year-end closing.');
await attempt('acct', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Journals').click();
    await shot('System-generated journals (booking, receipts, commissions) and manual entry form routed to the TL for posting', 'Accounting & Disbursement › Journals');
    await tab('Trial balance').click();
    await shot('Trial balance and financial reports generated from the ledger', 'Accounting & Disbursement › Trial balance');
    await tab('Periods & year-end').click();
    await shot('EOD / EOM / EOY: period close and reopen, fiscal-year close to retained earnings', 'Accounting & Disbursement › Periods & year-end');
  });
});

// ───────────────────────── P06 Disbursement
proc('06-disbursement', 'Disbursement', 'DISBURSEMENT.pdf', 'accountant → admin (reviewer) → fin.head → accountant', 'Disbursement chain DPO → DTL → DSH → DUH with segregation of duties, payment posting and confirmation email; weekly remittance to insurers.');
await attempt('disb', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Remittances').click();
    await shot('Weekly remittance extract of applied payments per insurer, sanitised and submitted to Disbursement', 'Accounting & Disbursement › Remittances');
    await tab('Disbursements').click();
    await page.getByLabel('Payee').fill(`Supplier ${stamp}`); await page.getByLabel('Amount (₱)').fill('1200');
    await shot('Disbursement request (DPO) with payee, amount, mode and bank details', 'Accounting & Disbursement › Disbursements › Request');
    await page.getByRole('button', { name: 'Request', exact: true }).click(); await expectToast(/Disbursement requested/);
    await shot('Request awaits a reviewer other than the maker (segregation of duties)', 'Accounting & Disbursement › Disbursements');
  });
  await as('admin', async () => {
    await nav('Accounting & Disbursement').click();
    await row(new RegExp(`Supplier ${stamp}`)).getByRole('button', { name: 'Review OK' }).click(); await expectToast(/Finance Head/);
    await shot('Team lead review (DTL) OK; routed to the Finance Head for approval', 'Accounting & Disbursement › Disbursements › Review OK');
  });
  await approve('fin.head', new RegExp(`Supplier ${stamp}`), { shots: true, before: 'Finance Head (DSH / DUH) reviews the voucher', after: 'Approved; ready for payment' });
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click();
    answers = [[/cheque|reference/i, `CHQ-PAY-${stamp}`]];
    await row(new RegExp(`Supplier ${stamp}`)).getByRole('button', { name: 'Pay' }).click(); await expectToast(/Paid, posted/);
    await shot('Payment posted with cheque reference; status tagged paid and confirmation email sent', 'Accounting & Disbursement › Disbursements › Pay');
  });
});

// ───────────────────────── P07 Refund request
proc('07-refund-request', 'Refund Request', 'REFUND REQUEST.pdf', 'accountant (TL) → fin.head (UH)', 'Refund Request Form raised from a cancellation, TL review, Unit Head sign-off and hand-off to the disbursement chain.');
await attempt('refund', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Refund requests').click();
    await shot('RRF register: refund raised by the endorsement with amount, mode and reason', 'Accounting & Disbursement › Refund requests');
    await row(new RegExp(`Acme Freight ${stamp}`)).getByRole('button', { name: 'TL review OK' }).click(); await expectToast(/RRF reviewed/);
    await shot('Marketing TL reviews the RRF', 'Accounting & Disbursement › Refund requests › TL review OK');
  });
  await as('fin.head', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Refund requests').click();
    await row(new RegExp(`Acme Freight ${stamp}`)).getByRole('button', { name: 'UH approve' }).click(); await expectToast(/disbursement request created/);
    await shot('Unit Head sign-off: a disbursement request is created for the refund', 'Accounting & Disbursement › Refund requests › UH approve');
    await tab('Disbursements').click();
    await shot('Refund enters the disbursement chain (review → approve → pay)', 'Accounting & Disbursement › Disbursements');
  });
});

// ───────────────────────── P08 ACSL
proc('08-acsl', 'ACSL (Insurer SOA reconciliation)', 'ACSL.pdf', 'accountant → fin.head', 'Insurer statement of account reconciled against the ledger; abnormal balances raise adjustment entries reviewed by the TL and posted by the FRBS approver.');
await attempt('acsl', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('ACSL / SOA recon').click();
    await page.getByLabel('Insurer').selectOption({ index: 1 });
    await page.getByLabel(/SOA lines/).fill(`${policyA}, 12000\nPOL-9999-00002, 500`);
    await shot('Insurer SOA lines captured against the ledger', 'Accounting & Disbursement › ACSL / SOA recon');
    await page.getByRole('button', { name: 'Reconcile' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Variances flagged (abnormal balances, unknown items) for manual subsidiary-ledger adjustment', 'Accounting & Disbursement › ACSL / SOA recon › Result');
    const adjBtn = page.getByRole('button', { name: /Adjust/ }).first();
    if (await adjBtn.count()) { await adjBtn.click(); await shot('Adjustment entries drafted, routed to the FRBS approver for posting', 'Accounting & Disbursement › ACSL / SOA recon › Adjustment'); }
  });
});

// ───────────────────────── P09 Claims
proc('09-claims', 'Claims', 'CLAIMS PROCESS FLOW.pdf', 'claims → fin.head', 'Notice of loss, PLA, document checklist, FLA to the insurer, evaluation and offer, contest loop, settlement approval and closure.');
await attempt('claims', async () => {
  await as('claims', async () => {
    await nav('Claims').click();
    await page.getByLabel('Policy number').fill(policyA); await page.getByLabel('Estimated amount (₱)').fill('50000'); await page.getByLabel('Description').fill('Collision on C5 southbound');
    await shot('Notice of loss registered against the policy (Claims Acceptance Control checks premium status)', 'Claims › Register');
    await page.getByRole('button', { name: 'Register' }).click(); await expectToast(/Preliminary Loss Advice/);
    await shot('Preliminary Loss Advice (PLA) sent; claim opened with reserve', 'Claims › Register');
    await row(new RegExp(policyA)).click(); await dlg().waitFor();
    await shot('Document checklist by line (motor / non-motor); FLA blocked until complete', 'Claims › Claim detail › Document checklist');
    const total = await dlg().getByRole('button', { name: 'Received' }).count();
    for (let i = 0; i < total; i++) { await dlg().getByRole('button', { name: 'Received' }).first().click(); await dlg().getByRole('button', { name: 'Unmark' }).nth(i).waitFor(); }
    await shot('All requirements received: documents complete', 'Claims › Claim detail');
    answers = [];
    await dlg().getByRole('button', { name: 'Send Formal Loss Advice' }).click(); await expectToast(/fla sent/);
    await shot('Formal Loss Advice sent to the insurer; adjuster inspection flagged', 'Claims › Claim detail › Send FLA');
    await dlg().getByRole('button', { name: 'Insurer evaluating' }).click(); await expectToast(/under review/);
    answers = [[/Offer amount/i, '40000'], [/position|contest/i, 'Estimate is 45000']];
    await dlg().getByRole('button', { name: 'Offer received' }).click(); await expectToast(/offer received/);
    await shot('Insurer evaluation and offer received', 'Claims › Claim detail › Offer received');
    await dlg().getByRole('button', { name: 'Contest offer' }).click(); await expectToast(/offer contested/);
    await shot('Insured contests the offer; re-evaluation loop with the insurer', 'Claims › Claim detail › Contest offer');
    await dlg().getByRole('button', { name: 'Offer received' }).click(); await expectToast(/offer received/);
    await dlg().getByRole('button', { name: 'Insured accepts' }).click(); await expectToast(/offer accepted/);
    await dlg().getByRole('button', { name: 'Request settlement approval' }).click(); await expectToast(/settlement requested/);
    await shot('Settlement by LOA to casa/dealer or cash requested for approval', 'Claims › Claim detail › Request settlement approval');
    await page.getByRole('button', { name: 'Close' }).first().click();
  });
  await approve('fin.head', /Settle CLM-/, { shots: true, before: 'Approver reviews the settlement', after: 'Settlement approved' });
  await as('claims', async () => {
    await nav('Claims').click(); await row(new RegExp(policyA)).click(); await dlg().waitFor();
    await dlg().getByRole('button', { name: 'Mark settled / paid' }).click(); await expectToast(/settled/);
    await shot('Claim tagged settled / paid, then closed; declination is the alternative exit', 'Claims › Claim detail › Mark settled');
  });
});

// ───────────────────────── P10 Case management
proc('10-case-management', 'Case Management (To-Be)', 'CASE MANAGEMENT TO BE PROCESS FLOW_07152026.pdf', 'compliance', 'General vs account-related inquiries, positive identification, point-of-contact handling or referral to the fulfilment unit, TAT monitoring and return to CCC.');
await attempt('cases', async () => {
  await as('compliance', async () => {
    await nav('Customer Servicing').click();
    await page.getByLabel('Concern').selectOption('inquiry'); await page.getByLabel('Description').fill('What are your office hours?');
    await shot('Contact logged: general inquiry (no client) vs account-related concern', 'Customer Servicing › Cases › Log case');
    await page.getByRole('button', { name: 'Log case' }).click(); await expectToast(/closed at point of contact/);
    await shot('General inquiry handled and closed at point of contact', 'Customer Servicing › Cases');
    const sel = page.getByLabel(/Client \(blank/); const cv = await sel.locator('option', { hasText: `Acme Freight ${stamp}` }).getAttribute('value'); await sel.selectOption(cv);
    await page.getByLabel('Concern').selectOption('billing'); await page.getByLabel('Description').fill('Client disputes the amount on the latest invoice');
    await page.getByLabel('Positive identification').fill('acmefreight@example.com');
    await shot('Account-related concern: positive identification (PID) and routing to the owning unit with a TAT', 'Customer Servicing › Cases › Log case');
    await page.getByRole('button', { name: 'Log case' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Case referred to the fulfilment unit; TAT due time computed and past-TAT flagged', 'Customer Servicing › Cases');
    const r = () => row(/disputes the amount/).first();
    await r().getByRole('button', { name: /in progress/ }).click(); await page.locator('.toast').last().waitFor();
    answers = [[/Return reason/i, 'Mis-routed to billing; policy concern']];
    await r().getByRole('button', { name: 'Return to CCC' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Case returned to the Customer Contact Centre for re-logging with a reason', 'Customer Servicing › Cases › Return to CCC');
    await r().getByRole('button', { name: 'Re-log' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Case re-logged and back in the open queue', 'Customer Servicing › Cases › Re-log');
  });
});

// ───────────────────────── P11 Customer servicing facility
proc('11-customer-servicing-facility', 'Customer Servicing Facility', 'CUSTOMER SERVICING FACILITY - Process Flow.pdf', 'compliance', 'Search by invoice, policy or client name; view policies, invoices and receipts; update contact details.');
await attempt('csf', async () => {
  await as('compliance', async () => {
    await nav('Customer Servicing').click(); await tab('Servicing facility').click();
    await page.getByPlaceholder(/Invoice no., policy no./).fill('Acme'); await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Update contact' }).first().waitFor();
    await shot('Servicing facility: search by invoice no., policy no. or client name', 'Customer Servicing › Servicing facility');
    answers = [[/Email/i, `updated${stamp}@example.com`], [/Phone/i, '0917-555-0100']];
    await page.getByRole('button', { name: 'Update contact' }).first().click(); await page.locator('.toast').last().waitFor();
    await shot('Client contact details updated from the facility', 'Customer Servicing › Servicing facility › Update contact');
  });
});

// ───────────────────────── P12 Renewal
proc('12-renewal', 'Renewal (RMEL)', 'RENEWAL (1).pdf', 'renewals', 'Renewal master expiry list 140 days out, sanitation and disposition, initial and final RA letters, client acceptance and renewal placement.');
await attempt('renewal', async () => {
  const inc = new Date(); inc.setUTCDate(inc.getUTCDate() - 335);
  await as('nb.officer', async () => { await newClient(`Renewal Corp ${stamp}`); policyC = await issuePolicy(`Renewal Corp ${stamp}`, 'MTR-CTPL · Motor CTPL', '100000', { inception: inc.toISOString().slice(0, 10) }); });
  await approve('uw.head', new RegExp(policyC));
  await as('renewals', async () => {
    await nav('Renewal').click();
    await shot('RMEL: policies expiring within 140 days, pending sanitation', 'Renewal › Pipeline');
    const r = () => row(new RegExp(policyC));
    await r().getByRole('button', { name: 'For renewal', exact: true }).click(); await expectToast(/Dispositioned/);
    await shot('Sanitation: disposition for renewal / remarket / not for renewal (NRNS letter)', 'Renewal › For renewal');
    await r().getByRole('button', { name: 'Initial RA (−70d)' }).click(); await expectToast(/Initial RA/);
    await shot('Initial renewal advice letter sent 70 days before expiry', 'Renewal › Initial RA');
    await r().getByRole('button', { name: 'Final RA (−45d)' }).click(); await expectToast(/Final RA/);
    await shot('Final renewal advice letter sent 45 days before expiry', 'Renewal › Final RA');
    await r().getByRole('button', { name: 'Client accepted' }).click(); await expectToast(/acceptance recorded/);
    answers = [[/sum insured/i, '120000']];
    await r().getByRole('button', { name: 'Renew → placement' }).click(); await expectToast(/placed with insurer/);
    await shot('Client accepted: renewal policy enters placement and the e-policy cycle', 'Renewal › Renew → placement');
  });
});

// ───────────────────────── P13 Reinsurance
proc('13-reinsurance', 'Reinsurance', 'RENISURANCE PROCESS FLOW.pdf', 'ri.officer', 'Facultative request with 24-hour acknowledgement and 3-day slip TAT, underwriting information loop, reinsurer security rating, signed slips, closing and debit note; treaties and cessions.');
await attempt('ri', async () => {
  await as('ri.officer', async () => {
    await nav('Reinsurance').click();
    await page.getByLabel('Sum insured (₱)').fill('2000000000'); await page.getByLabel('Risk description').fill('Petrochemical plant, sum insured PHP 2B');
    await shot('Facultative placement request from marketing with the risk details', 'Reinsurance › Facultative placements › Request');
    await page.getByRole('button', { name: 'Request placement' }).click(); await expectToast(/acknowledge within 24h/);
    await shot('Request logged; acknowledgement due within 24 hours (TAT flag)', 'Reinsurance › Facultative placements');
    const r = () => row(/FAC-\d{4}-\d{5}/).first();
    await r().getByRole('button', { name: 'Acknowledge' }).click(); await expectToast(/acknowledged/);
    await shot('Acknowledged; slip due within 3 working days', 'Reinsurance › Acknowledge');
    await r().getByRole('button', { name: 'Prepare slip' }).click(); const slip = page.locator('form.card', { hasText: 'Facultative slip' }); await slip.waitFor();
    await slip.locator('tbody input:not([type=number]):not([type=checkbox])').first().fill('Munich Re');
    await slip.locator('input[type=number]').first().fill('1');
    await slip.locator('input[type=number]').nth(1).fill('250000');
    await slip.locator('input[type=checkbox]').first().check();
    await shot('Slip: reinsurers approached with security rating, share and signed-slip evidence', 'Reinsurance › Prepare slip');
    await page.getByRole('button', { name: 'Save slip' }).click(); await expectToast(/slip prepared/);
    await r().getByRole('button', { name: /Close & debit note/ }).click(); await expectToast(/placed|debit note/i);
    await shot('Closing: placement closed and debit note issued to the cedant', 'Reinsurance › Close & debit note');
    await tab('Treaties & cessions').click();
    await shot('Treaty register and cessions with capacity monitoring', 'Reinsurance › Treaties & cessions');
  });
});

// ───────────────────────── P14 Submitted policies
proc('14-submitted-policies', 'Submitted Policies', 'Submitted Policies_Process Flow.pdf', 'accountant', 'Masterlist validation, matching and consolidation, adequacy review with IAAF findings, and hand-off to sanitation 150 days from expiry.');
await attempt('sp', async () => {
  await as('accountant', async () => {
    await nav('Submitted Policies').click();
    await page.getByLabel(/Insurer \(for matching\)/).selectOption({ index: 1 });
    await shot('Masterlist upload from the bank / insurer for validation and matching', 'Submitted Policies › Masterlist batches');
    await page.getByRole('button', { name: 'Run pipeline' }).click(); await expectToast(/masterlist/);
    await shot('Rows validated, matched and consolidated; each reviewed for adequacy', 'Submitted Policies › Masterlist batches › Run pipeline');
    answers = [[/Findings/i, 'Sum insured below loan value']];
    await page.getByRole('button', { name: 'Findings → IAAF' }).first().click(); await expectToast(/IAAF/);
    await shot('Findings recorded and an Insurance Adequacy Assessment Form (IAAF) issued', 'Submitted Policies › Findings → IAAF');
    await tab('Expiring (150 days)').click();
    await shot('Policies 150 days from expiry sent to the sanitation handler for renewal / conversion opportunity', 'Submitted Policies › Expiring (150 days)');
  });
});

// ───────────────────────── P15 Employee benefits
proc('15-employee-benefits', 'Employee Benefits', 'EMPLOYEE BENEFITS - Process Flow.pdf', 'eb.officer', 'Renewal advice, BOR, TOR with master list and utilisation released to insurers, comparative analysis, award with ISACOM for non-accredited providers, handoff.');
await attempt('eb', async () => {
  await as('eb.officer', async () => {
    await nav('Employee Benefits').click();
    await page.getByLabel('Corporate client').selectOption({ index: 1 }); await page.getByLabel('Incumbent insurer').selectOption({ index: 1 });
    await page.getByLabel('Plan').fill(`Gold HMO ${stamp}`); await page.getByLabel(/Indicative premium/).fill('12000');
    await shot('Prospect scheme created from the renewal advice', 'Employee Benefits › Create scheme');
    await page.getByRole('button', { name: 'Create scheme' }).click(); await expectToast(/Prospect scheme created/);
    await row(new RegExp(`Gold HMO ${stamp}`)).click(); await page.getByRole('button', { name: 'BOR received' }).waitFor();
    await page.getByRole('button', { name: 'BOR received' }).click(); await expectToast(/BOR received/);
    await page.getByRole('button', { name: 'TOR prepared' }).click(); await expectToast(/TOR prepared/);
    await page.getByRole('button', { name: 'Upload census' }).click(); await expectToast(/Census/);
    await shot('Broker of Record received, Terms of Reference prepared, member census uploaded', 'Employee Benefits › Scheme detail');
    const multi = page.locator('select[multiple]');
    await multi.selectOption([{ index: 0 }, { index: 1 }]);
    await page.getByRole('button', { name: 'Release TOR to insurers' }).click(); await expectToast(/released to insurers/);
    await shot('TOR, master list and utilisation released to insurers (franchise)', 'Employee Benefits › Release TOR to insurers');
    answers = [[/Premium/i, '11500'], [/Benefits/i, 'Room and board 4,000; MBL 150,000; dental'], [/Capabilities/i, '85']];
    await page.getByRole('button', { name: 'Record proposal' }).first().click(); await expectToast(/Proposal recorded/);
    answers = [[/Premium/i, '12800'], [/Benefits/i, 'Room and board 3,500; MBL 120,000'], [/Capabilities/i, '70']];
    const second = page.getByRole('button', { name: 'Record proposal' }).first(); if (await second.count()) { await second.click(); await expectToast(/Proposal recorded/); }
    await shot('Comparative analysis of proposals: premium, benefits and capabilities', 'Employee Benefits › Proposals');
    await page.getByRole('button', { name: 'Award' }).first().click(); await page.locator('.toast', { hasText: /Awarded|ISACOM/ }).last().waitFor();
    await shot('Client confirmation and award; ISACOM approval when the provider is not accredited; handoff to processing and collections', 'Employee Benefits › Award');
  });
});

// ───────────────────────── P16 Product maintenance / TSU
proc('16-product-maintenance-tsu', 'Product Maintenance (TSU)', 'PRODUCT MAINTENANCE TSU PROCESS_0709.pdf', 'admin → uw.head', 'Technical Services Unit request for non-packaged risks: completeness and duplicate check, quotation slip, TL approval, RI referral, insurer responses, comparative table and proposal slip; package maintenance with release advisory.');
await attempt('tsu', async () => {
  await as('admin', async () => {
    await newClient(`Warehouse Corp ${stamp}`);
    await nav('Product Maintenance').click(); await tab('TSU requests').click();
    const v = await page.getByLabel('Client').locator('option', { hasText: `Warehouse Corp ${stamp}` }).getAttribute('value');
    await page.getByLabel('Client').selectOption(v); await page.getByLabel('Sum insured (₱)').fill('30000000');
    await page.getByLabel(/Risk details/).fill('Warehouse complex, sprinklered, Class A construction');
    await shot('PRF / TSU request for a non-packaged risk with completeness and duplicate check', 'Product Maintenance › TSU requests › Submit');
    await page.getByRole('button', { name: 'Submit to TSU' }).click(); await expectToast(/TSU request submitted/);
    const tsuNo = (await row(/TSU-\d{4}-\d{5}/).first().textContent()).match(/TSU-\d{4}-\d{5}/)[0];
    const r = () => row(new RegExp(tsuNo));
    await r().getByRole('button', { name: 'Acknowledge' }).click(); await expectToast(/acknowledged/);
    await shot('TSU acknowledges the request (or returns it as incomplete)', 'Product Maintenance › TSU requests › Acknowledge');
    await r().click(); await page.getByRole('heading', { name: new RegExp(tsuNo) }).waitFor();
    answers = [[/Quotation slip/i, 'Fire and allied perils, PHP 30M, deductible 1%'], [/Premium quoted/i, '180000'], [/evidence/i, 'signed slip'], [/Conditions/i, 'Subject to survey'], [/Selected insurer id/i, '1'], [/Proposal slip/i, 'Malayan selected: best terms, no exceptions']];
    await r().getByRole('button', { name: 'Prepare quotation slip' }).click(); await page.locator('.toast').last().waitFor();
    await r().getByRole('button', { name: 'TL approve QS' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Quotation slip prepared and approved by the TL', 'Product Maintenance › TSU detail › TL approve QS');
    await r().getByRole('button', { name: 'Refer to RI' }).click(); await page.locator('.toast').last().waitFor();
    await r().getByRole('button', { name: /RI cleared/ }).click(); await page.locator('.toast').last().waitFor();
    await shot('RI referral cleared; quotation slip sent to insurers', 'Product Maintenance › TSU detail › Send QS to insurers');
    await r().click(); const rec = page.getByRole('button', { name: 'Record response' }).first(); if (await rec.count()) { await rec.click(); await page.locator('.toast').last().waitFor(); }
    await r().getByRole('button', { name: 'Comparative table ready' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Insurer responses recorded (accepted with evidence / declined / conditional); comparative table ready', 'Product Maintenance › TSU detail › Comparative table');
    await r().getByRole('button', { name: 'Approve proposal slip' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Proposal slip approved with the selected insurer; released to marketing and the client', 'Product Maintenance › TSU detail › Approve proposal slip');
    await page.getByRole('button', { name: 'Close' }).first().click();
    await tab('Packages').click();
    answers = [[/^Field/i, 'commissionRate'], [/^New value/i, '0.16'], [/summary/i, `Commission uplift ${stamp}`]];
    await shot('Packaged product catalogue with rates, taxes and limits', 'Product Maintenance › Packages');
    await row(/MTR-CTPL/).getByRole('button', { name: 'Change request' }).click(); await expectToast(/Maintenance request raised/);
    await shot('Package maintenance request raised for validation and approval', 'Product Maintenance › Packages › Change request');
  });
  await approve('uw.head', new RegExp(`Commission uplift ${stamp}`), { shots: true, before: 'Approver validates the product change', after: 'Change applied and a release advisory published' });
  await as('admin', async () => {
    await nav('Product Maintenance').click(); await tab('Insurers').click();
    await shot('Insurer panel with accreditation and SFTP enrolment for placement channels', 'Product Maintenance › Insurers');
  });
});

// ───────────────────────── P01 BDOIR end-to-end (summary) + supporting
proc('01-bdoir-e2e', 'BDOIR End-to-End', 'BDOIR E2E PROCESS FLOW.pdf', 'admin', 'The umbrella flow that chains new business, cashiering, collections, remittance, disbursement, the general ledger, renewal and claims. Each link is captured in detail in its own process below; these screens show the control points that tie the chain together.');
await attempt('e2e', async () => {
  await as('admin', async () => {
    await shot('Executive dashboard: KPIs across the whole chain (in force, in placement, unapplied payments, pending approvals, disbursements in flight, past-TAT requests)', 'Dashboard');
    await nav('Approvals & Audit').click(); await tab('All').click();
    await shot('Single maker-checker queue for bookings, endorsements, journals, disbursements, CTE, claim settlements, EB awards and product changes', 'Approvals & Audit › All');
    await nav('Reports & Analytics').click();
    await shot('Production, collection and claims reports with CSV export', 'Reports & Analytics');
    await nav('Sanction Screening & Risk').click();
    await shot('Client onboarding with sanctions screening, PEP flag and risk tiering feeding every process', 'Sanction Screening & Risk');
    await nav('User Access Maintenance').click();
    await shot('Twelve personas with module entitlements and approver rights (segregation of duties)', 'User Access Maintenance');
    await nav('Data Migration').click();
    await shot('Legacy data migration batches with load, reconciliation and disposition', 'Data Migration');
  });
});

S.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), processes: S }, null, 2));
console.log('DONE', S.map((p) => `${p.id}: ${p.steps.length} shots, ${p.errors.length} errors`).join('\n'));
await browser.close();
