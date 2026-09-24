/**
 * Process-flow walkthrough capture: drives every BDOI process in a real browser with the responsible
 * personas and records, for each step, who acts, what they click, what they enter, what the system answers
 * and which control applies. Each step yields a full screen (acted-on area highlighted) and a close-up crop,
 * plus manifest.json, under docs/process-walkthrough.
 *
 * Requires a running platform (API + web) seeded with demo data:
 *   BASE_URL=http://localhost:5173 node e2e/walkthrough.mjs
 * Then `node scripts/build-walkthrough.mjs` and `node scripts/build-walkthrough-deck.cjs` (or `npm run walkthrough`).
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

const PERSONAS = {
  admin: { name: 'System Administrator', role: 'Administrator', unit: 'IT' },
  'nb.officer': { name: 'Maria Santos', role: 'New Business Officer (MAO)', unit: 'New Business' },
  'uw.head': { name: 'Ramon Villareal', role: 'Underwriting Head (checker)', unit: 'Underwriting' },
  cashier: { name: 'Liza Bautista', role: 'Cashier', unit: 'Operations' },
  collections: { name: 'Paolo Reyes', role: 'Collections Officer', unit: 'Collections' },
  accountant: { name: 'Grace Lim', role: 'Accountant (FRBS)', unit: 'Finance' },
  'fin.head': { name: 'Antonio Cruz', role: 'Finance Head (approver)', unit: 'Finance' },
  claims: { name: 'Jenny Ocampo', role: 'Claims Officer', unit: 'Claims' },
  renewals: { name: 'Carlo Mendoza', role: 'Renewal Officer', unit: 'Renewals' },
  'ri.officer': { name: 'Ana Dizon', role: 'Reinsurance Officer', unit: 'Reinsurance' },
  'eb.officer': { name: 'Mark Tan', role: 'Employee Benefits Officer', unit: 'Employee Benefits' },
  compliance: { name: 'Lily Belarmino', role: 'Compliance Officer (CCC)', unit: 'Compliance' },
};

// Prompt answers: first matching regex wins; confirms are accepted.
let answers = [];
page.on('dialog', (d) => { const m = d.message(); const hit = answers.find(([re]) => re.test(m)); d.accept(hit ? hit[1] : 'ok'); });

const S = []; let cur; let currentUser = null;
const proc = (id, title, pdf, persona, summary) => { cur = { id, title, pdf, persona, summary, steps: [], errors: [] }; S.push(cur); mkdirSync(`${OUT}/shots/${id}`, { recursive: true }); };

/**
 * Capture one step. `d` carries the narrative: action (what the persona does), inputs (what they enter),
 * result (what the system answers), rule (the control behind it), focus (locator to highlight and crop).
 */
async function shot(step, screen, d = {}) {
  await page.waitForTimeout(450);
  const n = String(cur.steps.length + 1).padStart(2, '0');
  const file = `shots/${cur.id}/${n}.jpg`;
  const zoom = `shots/${cur.id}/${n}-zoom.jpg`;
  const toasts = await page.locator('.toast').allInnerTexts().catch(() => []);
  let box = null;
  const focus = d.focus ? (typeof d.focus === 'function' ? d.focus() : d.focus) : null;
  if (focus) {
    try {
      const el = focus.first();
      await el.scrollIntoViewIfNeeded({ timeout: 3000 });
      box = await el.boundingBox();
      if (box) await el.evaluate((e) => { e.setAttribute('data-walk-focus', '1'); e.style.outline = '4px solid #FFC400'; e.style.outlineOffset = '4px'; e.style.boxShadow = '0 0 0 10px rgba(255,196,0,0.22)'; });
    } catch { box = null; }
  }
  await page.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 80 });
  if (box) {
    const pad = 28, minW = 760, minH = 340;
    let x = box.x - pad, y = box.y - pad, w = box.width + pad * 2, h = box.height + pad * 2;
    if (w < minW) { x -= (minW - w) / 2; w = minW; }
    if (h < minH) { y -= (minH - h) / 2; h = minH; }
    x = Math.max(0, x); y = Math.max(0, y); w = Math.min(w, 1440 - x); h = Math.min(h, 900 - y);
    await page.screenshot({ path: `${OUT}/${zoom}`, type: 'jpeg', quality: 84, clip: { x, y, width: w, height: h } });
    box = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    await page.locator('[data-walk-focus]').evaluateAll((els) => els.forEach((e) => { e.removeAttribute('data-walk-focus'); e.style.outline = ''; e.style.outlineOffset = ''; e.style.boxShadow = ''; })).catch(() => {});
  }
  const persona = currentUser ? { user: currentUser, ...PERSONAS[currentUser] } : null;
  cur.steps.push({ n, step, screen, persona, action: d.action ?? '', inputs: d.inputs ?? [], result: d.result ?? '', rule: d.rule ?? '', toasts: toasts.slice(-3), file, zoom: box ? zoom : null, box });
  console.log(`${cur.id} ${n} ${step}`);
}
async function attempt(label, fn) { try { await fn(); } catch (e) { const msg = String(e).split('\n')[0]; cur.errors.push(`${label}: ${msg}`); console.log(`  !! ${cur.id} ${label}: ${msg}`); } }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nav = (name) => page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: new RegExp(`${esc(name)}$`) });
const tab = (name) => page.locator('.tabs').getByRole('button', { name, exact: true });
const row = (re) => page.getByRole('row', { name: re }).first();
const dlg = () => page.getByRole('dialog');
const table = () => page.locator('main table').first();
const card = (text) => page.locator('main .card', { hasText: text }).first();
async function login(u) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Username').fill(u); await page.getByLabel('Password').fill(u === 'admin' ? 'Admin@123' : 'Broker@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: /Good day/ }).waitFor();
  currentUser = u;
}
async function signOut() { try { await page.getByRole('button', { name: 'Sign out' }).click({ timeout: 3000 }); } catch { await page.goto(`${BASE}/login`); } currentUser = null; }
async function as(u, fn) { await login(u); try { await fn(); } finally { await signOut(); } }
async function expectToast(re) { await page.locator('.toast', { hasText: re }).last().waitFor(); }
async function lastToast() { await page.locator('.toast').last().waitFor(); }

async function newClient(name, withShots = false) {
  await nav('Sanction Screening & Risk').click();
  await page.getByLabel('Name').fill(name); await page.getByLabel('Type').selectOption('corporate');
  const email = `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`;
  await page.getByLabel('Email').fill(email); await page.getByLabel('TIN').fill(`TIN-${stamp}-${name.length}`);
  if (withShots) await shot('MAO creates the client in Broker; KYC details captured', 'Sanction Screening & Risk › New client form', {
    action: 'Open Sanction Screening & Risk, fill in the new client form and press Create & screen.',
    inputs: [`Name: ${name}`, 'Type: corporate', `Email: ${email}`, `TIN: TIN-${stamp}-${name.length}`],
    result: 'The client is created with a client number and screened against the sanctions and PEP lists in the same call.',
    rule: 'Every client is screened before any quotation can be issued for it; a hit blocks new business until Compliance clears it.',
    focus: () => card('Create & screen') });
  await page.getByRole('button', { name: 'Create & screen' }).click(); await expectToast(/screening clear/);
  if (withShots) await shot('Client is sanction-screened automatically (clear / hit) and risk-tiered', 'Sanction Screening & Risk › Client register', {
    action: 'Read the toast and the new row in the client register.',
    result: 'Toast confirms the client number, screening result and risk tier; the row shows the CDD level and screening status.',
    rule: 'Risk tier drives the customer due-diligence level (simplified / standard / enhanced).',
    focus: () => row(new RegExp(name)) });
  return email;
}

/** Quote → proposal → accept → placement → placed → book. Returns policy no. */
async function issuePolicy(client, product = 'MTR-CMP · Motor Comprehensive', si = '1000000', opts = {}) {
  await nav('New Business').click();
  const v = await page.getByLabel('Client').locator('option', { hasText: client }).getAttribute('value');
  await page.getByLabel('Client').selectOption(v); await page.getByLabel('Product').selectOption({ label: product });
  await page.getByRole('combobox', { name: /^Insurer/ }).selectOption({ index: 1 }); await page.getByLabel('Sum insured (₱)').fill(si);
  if (opts.inception) await page.getByLabel('Inception date').fill(opts.inception);
  const S_ = opts.shots;
  if (S_) await shot('Quotation prepared with the rating engine (premium, VAT, DST, LGT, commission)', 'New Business › Quotations & proposals › New quotation form', {
    action: 'Pick the client, the packaged product and the insurer, enter the sum insured and press Create quotation.',
    inputs: [`Client: ${client}`, `Product: ${product}`, 'Insurer: first accredited insurer on the panel', `Sum insured: ₱${Number(si).toLocaleString()}`, 'Hold cover (days): blank unless the insurer must hold cover before placement'],
    result: 'The rating engine computes premium, VAT, DST, LGT and FST, and the broker commission from the product rates.',
    rule: 'Non-packaged products cannot be quoted here; they require an approved TSU proposal first (see Product Maintenance / TSU).',
    focus: () => card('Create quotation') });
  await page.getByRole('button', { name: 'Create quotation' }).click(); await expectToast(/Quotation created/);
  const r = () => row(new RegExp(client));
  if (S_) await shot('Quotation created (status: quoted); hold cover can be requested from the insurer', 'New Business › Quotations & proposals', {
    action: 'Check the new quotation row and its computed amounts.',
    result: 'Quotation number QT-YYYY-NNNNN assigned; status quoted; the row offers Send proposal.',
    rule: 'Acceptance limits and the survey threshold on the product are checked at quotation time.',
    focus: r });
  await r().getByRole('button', { name: 'Send proposal' }).click(); await expectToast(/Proposal emailed/);
  if (S_) await shot('Proposal sent to the client by email (status: proposal sent)', 'New Business › Quotations & proposals › Send proposal', {
    action: 'Press Send proposal on the quotation row.',
    result: 'The proposal is emailed to the client (see Outbox) and the status moves to proposal sent.',
    rule: 'Order is enforced: a quotation must be quoted before a proposal can be sent.',
    focus: r });
  await r().getByRole('button', { name: 'Client accepted' }).click(); await expectToast(/acceptance recorded/);
  if (S_) await shot('Client acceptance recorded (Y); a decline with reason is the N branch', 'New Business › Quotations & proposals › Client accepted', {
    action: 'Press Client accepted once the signed proposal or proof of payment is received.',
    result: 'Acceptance recorded with a timestamp; Request placement becomes available.',
    rule: 'Declined is the N branch: a decline reason is captured and the quotation is closed.',
    focus: r });
  await r().getByRole('button', { name: 'Request placement' }).click(); await dlg().getByRole('heading', { name: /Policy POL-/ }).waitFor();
  const policyNo = (await dlg().getByRole('heading', { name: /Policy POL-/ }).textContent()).replace('Policy ', '').trim();
  if (S_) await shot('Placement requested: placement slip goes to the insurer via SFTP or email', 'New Business › Policy drawer (placement requested)', {
    action: 'Press Request placement; the policy shell opens in a drawer.',
    result: `Policy ${policyNo} created in status placement requested; the placement slip is sent by SFTP when the insurer is enrolled, otherwise by email.`,
    rule: 'Placement channel is decided by the insurer record (SFTP-enrolled or not).',
    focus: dlg });
  await page.getByRole('button', { name: 'Close' }).click(); await tab('Placement').click();
  if (S_) await shot('Placement board tracks slips awaiting the insurer, returns and e-policies', 'New Business › Placement', {
    action: 'Open the Placement tab.',
    result: 'Every policy awaiting the insurer is listed with slip sent time, return reason and the next action.',
    rule: 'A placement returned by the insurer carries a reason routed to marketing and can be resubmitted.',
    focus: table });
  const p = row(new RegExp(policyNo));
  answers = [[/insurer|ref/i, `INS-${stamp}`]];
  await p.getByRole('button', { name: /Placed \/ e-policy received/ }).click(); await expectToast(/E-policy received/);
  if (S_) await shot('Insurer placed the risk; e-policy received (COG via SFTP or PO email)', 'New Business › Placement › Placed / e-policy received', {
    action: 'Press Placed / e-policy received and enter the insurer policy reference in the prompt.',
    inputs: [`Insurer policy reference: INS-${stamp}`],
    result: 'Status placed; e-policy channel recorded; Book & invoice becomes available.',
    rule: 'E-policy exceptions are routed to the contact centre with an exception note.',
    focus: () => p });
  await p.getByRole('button', { name: 'Book & invoice' }).click(); await expectToast(/checker approval/);
  if (S_) await shot('Booking and invoicing raised for checker approval (maker-checker)', 'New Business › Placement › Book & invoice', {
    action: 'Press Book & invoice.',
    result: 'A policy_issue approval request is raised; the policy waits in pending approval.',
    rule: 'Maker-checker: the officer who books cannot approve; segregation of duties is enforced by the approval registry.',
    focus: () => p });
  return policyNo;
}
async function approve(user, re, opts = {}) {
  await as(user, async () => {
    await nav('Approvals & Audit').click();
    if (opts.shots) await shot(opts.before ?? 'Checker sees the pending request in the approval queue', 'Approvals & Audit › Pending', {
      action: 'Open Approvals & Audit; the Pending tab lists requests raised by makers.',
      result: 'The request shows type, summary, maker, maker note and time raised.',
      rule: opts.rule ?? 'Only users with approver rights on the module can decide; a maker can never approve their own request.',
      focus: () => row(re) });
    answers = [[/note|comment/i, 'Reviewed and approved']];
    await row(re).getByRole('button', { name: 'Approve' }).click(); await expectToast(/approved/);
    if (opts.shots) await shot(opts.after ?? 'Checker approves; the system posts the downstream entries', 'Approvals & Audit › Approve', {
      action: 'Press Approve and enter a checker note.',
      inputs: ['Checker note: Reviewed and approved'],
      result: opts.afterResult ?? 'The request is marked approved and the handler posts the downstream entries automatically.',
      rule: 'Every decision is written to the audit trail with before/after state.',
      focus: () => page.locator('.toast').last() });
  });
}
async function payCheque(policyNo, shots = false) {
  await nav('Operations').click();
  if (shots) await shot('Cashiering: open invoices (premium receivables) awaiting payment', 'Operations › Invoices & cashiering', {
    action: 'Open Operations; the Invoices & cashiering tab lists premium receivables.',
    result: 'Each invoice shows billed, paid, balance and status; open ones offer Receive.',
    rule: 'Invoices are generated automatically when the checker approves booking.',
    focus: table });
  await row(new RegExp(policyNo)).getByRole('button', { name: 'Receive' }).click();
  await page.getByLabel('Channel').selectOption('otc_cheque'); await page.getByLabel('Cheque no.').fill(`CHQ-${stamp}`);
  if (shots) await shot('Receive payment: channel (bills payment, OTC cash/cheque, batch files, autopay) and reference', 'Operations › Invoices & cashiering › Receive', {
    action: 'Press Receive on the invoice, choose the channel and enter the cheque details.',
    inputs: ['Channel: OTC cheque', `Cheque no.: CHQ-${stamp}`, 'Amount: defaults to the invoice balance'],
    result: 'The form is ready to post; cheque channels will be held for clearing.',
    rule: 'Channels mirror the flow: bills payment, OTC cash/cheque, CLPC/PMS/trade batch files, direct credit, autopay.',
    focus: () => page.locator('main form.card, main .card form').first() });
  await page.getByRole('button', { name: 'Record payment' }).click(); await expectToast(/Cheque held until/);
  if (shots) await shot('Cheque payment recorded and held for the 4-day clearing period', 'Operations › Receive › Record payment', {
    action: 'Press Record payment.',
    result: 'Toast shows the hold-until date; the payment is created in status held and is not yet applied to the invoice.',
    rule: 'Post-dated / OTC cheques are held four days before they can mature and apply.',
    focus: () => page.locator('.toast').last() });
  await tab('Payments / PDC / UPP').click();
  if (shots) await shot('PDC register: held cheques, matured, bounced (exclusion list) and unapplied premium', 'Operations › Payments / PDC / UPP', {
    action: 'Open the Payments / PDC / UPP tab.',
    result: 'The held cheque appears with Matured and Bounced actions; unapplied premium rows offer Apply to invoice.',
    rule: 'A bounced cheque is tagged with a reason and feeds the exclusion list.',
    focus: () => row(new RegExp(`CHQ-${stamp}`)) });
  if (shots) await shot('Held cheque shows Matured / Bounced actions once the 4-day hold lapses', 'Operations › Payments / PDC / UPP › Held cheque', {
    action: 'Attempting Matured before the hold date is refused by the API.',
    result: 'Conflict: "Cheque is on hold until <date> (4-day clearing)"; after the date, Matured applies the payment and issues the OR.',
    rule: 'PDC monitoring: maturity cannot be forced before the clearing period.',
    focus: () => row(new RegExp(`CHQ-${stamp}`)).getByRole('button', { name: 'Matured' }) });
  await tab('Invoices & cashiering').click();
  await row(new RegExp(policyNo)).getByRole('button', { name: 'Receive' }).click();
  await page.getByRole('button', { name: 'Record payment' }).click(); await expectToast(/Official receipt OR-/);
  if (shots) await shot('Cash / bills payment applied in full: official receipt issued and receivable cleared', 'Operations › Receive › Official receipt', {
    action: 'Receive the same invoice again through a cash / bills-payment channel and press Record payment.',
    inputs: ['Channel: bills payment (default)', 'Amount: invoice balance'],
    result: 'Official receipt OR-YYYY-NNNNN issued; invoice status paid; cash and premium journals posted.',
    rule: 'An applied payment posts Dr Cash / Cr Premium receivable and books the commission income.',
    focus: () => page.locator('.toast').last() });
}

let policyA, policyB, policyC, policyD, emailA;
// ───────────────────────── P02 New Business
proc('02-new-business', 'New Business', 'NEW BUSINESS.pdf', 'nb.officer → uw.head', 'Client creation and screening, quotation, proposal, placement to the insurer, e-policy and booking under maker-checker.');
await attempt('nb', async () => {
  await as('nb.officer', async () => {
    emailA = await newClient(`Acme Freight ${stamp}`, true);
    policyA = await issuePolicy(`Acme Freight ${stamp}`, 'MTR-CMP · Motor Comprehensive', '1000000', { shots: true });
  });
  await approve('uw.head', new RegExp(policyA), { shots: true, before: 'Underwriting Head (checker) reviews the booking request', after: 'Booking approved: invoice, journal and e-policy dispatch are posted automatically', afterResult: 'Policy in force, invoice generated, booking journal posted and the e-policy dispatched on the recorded channel.' });
  await as('nb.officer', async () => {
    await nav('New Business').click(); await tab('Policies').click();
    await shot('Policy register: the policy is in force with its invoice and e-policy channel', 'New Business › Policies', {
      action: 'Open the Policies tab.',
      result: `Policy ${policyA} shows in force with inception, expiry, premium, insurer reference and e-policy channel.`,
      rule: 'Only in-force, renewed or expired policies can carry claims.',
      focus: () => row(new RegExp(policyA)) });
    await row(new RegExp(policyA)).click(); await dlg().waitFor();
    await shot('Policy detail: placement history, e-policy status and the exception route to the contact centre', 'New Business › Policies › Policy detail', {
      action: 'Click the policy row to open its detail drawer.',
      result: 'Drawer shows period, taxes, commission, placement/booking/e-policy timestamps, invoices and claims.',
      rule: 'E-policy exception sends the case to the contact centre with the exception note.',
      focus: dlg });
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
    await shot('Payment with zero PR / payment greater than PR is recorded without an invoice', 'Operations › Invoices & cashiering › Payment without invoice', {
      action: 'Press Payment without invoice and enter the amount received.',
      inputs: ['Amount: ₱2,500.00', 'Client id: optional', 'Reference: transaction / file reference'],
      result: 'The payment can be posted even though no premium receivable matches it.',
      rule: 'Zero-PR and excess payments never sit against an invoice; they go to unapplied premium.',
      focus: () => page.locator('main form.card, main .card form').first() });
    await page.getByRole('button', { name: 'Record payment' }).click(); await expectToast(/unapplied/);
    await tab('Payments / PDC / UPP').click();
    await shot('The amount sits in Unapplied Premium (GL 2400) until applied to an invoice', 'Operations › Payments / PDC / UPP', {
      action: 'Open Payments / PDC / UPP and find the unapplied row.',
      result: 'Status unapplied with the unapplied amount; Apply to invoice prompts for the invoice id.',
      rule: 'Unapplied premium is a liability (GL 2400) until matched; refunds of UPP go through the RRF.',
      focus: () => page.getByRole('row', { name: /unapplied/ }).first() });
    await tab('Direct payments').click();
    await page.getByPlaceholder(/paid directly to insurer/).fill(policyD);
    await shot('Direct payment to insurer identified for a booked policy', 'Operations › Direct payments › Identify', {
      action: 'Enter the policy number the client paid directly to the insurer and press Identify direct payment.',
      inputs: [`Policy no.: ${policyD}`],
      result: 'The invoice is tagged direct-paid and a commission receivable is booked against the insurer.',
      rule: 'Direct-paid policies are excluded from the remittance extract; the broker collects only its commission.',
      focus: () => card('Identify direct payment') });
    await page.getByRole('button', { name: 'Identify direct payment' }).click(); await expectToast(/commission receivable/);
    const dr = () => row(new RegExp(policyD));
    await dr().getByRole('button', { name: 'Bill insurer' }).click(); await expectToast(/Updated/);
    await shot('Commission receivable (GL 1250) billed to the insurer; follow-up until collected', 'Operations › Direct payments › Bill insurer', {
      action: 'Press Bill insurer on the receivable row.',
      result: 'Status billed; the billing letter is queued to the insurer. Rejected / Re-bill handle disputes.',
      rule: 'Commission receivable lifecycle: identified → billed → approved → collected.',
      focus: dr });
    await dr().getByRole('button', { name: 'Insurer approved' }).click(); await expectToast(/Updated/);
    await dr().getByRole('button', { name: /Collect/ }).click(); await expectToast(/Updated/);
    await shot('Commission collected: commission official receipt issued', 'Operations › Direct payments › Collect (commission OR)', {
      action: 'Press Insurer approved, then Collect (commission OR).',
      result: 'Status collected; a commission OR is issued and Dr Cash / Cr Commission receivable is posted.',
      rule: 'Only approved receivables can be collected.',
      focus: dr });
    await tab('Adjustments').click();
    await page.getByLabel('Policy no.').fill(policyA); await page.getByLabel('Type').selectOption('adjustment');
    await page.getByLabel('Premium delta (₱)').fill('-3000'); await page.getByLabel('Refund to client (₱)').fill('1500'); await page.getByLabel('Description').fill('Premium adjustment: sum insured reduced per client request');
    await shot('Adjustment / cancellation validated by the Adjustment Team and routed to the checker-poster', 'Operations › Adjustments › Endorsement form', {
      action: 'Fill in the endorsement: policy, type, premium delta, refund and description, then press Submit for posting.',
      inputs: [`Policy no.: ${policyA}`, 'Type: adjustment (cancellation is the other type)', 'Premium delta: −₱3,000.00', 'Refund to client: ₱1,500.00', 'Description: Premium adjustment: sum insured reduced per client request'],
      result: 'An endorsement number is assigned and an endorsement approval is raised.',
      rule: 'Endorsements post only after the checker-poster approves; a cancellation sets the policy to cancelled.',
      focus: () => card('Submit for posting') });
    await page.getByRole('button', { name: 'Submit for posting' }).click(); await expectToast(/approval|posting|Endorsement/i);
    await shot('Endorsement pending checker approval; a refund creates a Refund Request Form (RRF) on approval', 'Operations › Adjustments', {
      action: 'Check the endorsement register.',
      result: 'The endorsement waits in pending; on approval the premium delta is journaled and an RRF is raised for the refund.',
      rule: 'Refund Request Forms originate from endorsements or unapplied premium, never from free-form entry.',
      focus: () => row(new RegExp(policyA)) });
    await tab('Production recon').click();
    await page.locator('.card', { hasText: 'Match & classify' }).locator('select').first().selectOption({ index: 1 });
    await page.getByLabel(/Rows: policy no/).fill(`${policyA}, 12500, INS-${stamp}\nPOL-9999-00001, 8000, INS-X`);
    await shot('Production reconciliation: insurer production file matched against booked policies', 'Operations › Production recon › Upload', {
      action: 'Choose the insurer, the booking period and paste the production register rows, then press Match & classify.',
      inputs: ['Insurer: first insurer on the panel', 'Booking period: current month', `Rows: ${policyA}, 12500, INS-${stamp}  /  POL-9999-00001, 8000, INS-X`],
      result: 'A reconciliation run is created with one classified row per line.',
      rule: 'Rows are classified matched, with discrepancies (premium or reference differs) or unbooked (policy unknown).',
      focus: () => card('Match & classify') });
    await page.getByRole('button', { name: 'Match & classify' }).click(); await page.locator('.toast', { hasText: /matched/ }).last().waitFor();
    await shot('Rows classified as matched, with discrepancies, or unbooked; each gets a disposition', 'Operations › Production recon › Result', {
      action: 'Read the result: counts per class and the detail rows.',
      result: 'Toast summarises matched / discrepancies / unbooked; the run detail lists each row with a Disposition action.',
      rule: 'Unbooked rows must be dispositioned (book, insurer error, cancelled) before the run closes.',
      focus: () => page.locator('main .card').last() });
  });
  await approve('admin', new RegExp(policyA), { shots: true, before: 'Checker-poster reviews the endorsement', after: 'Endorsement posted: premium and commission reversed, RRF raised for the refund', afterResult: 'Endorsement status posted; adjustment journal booked; RRF created in status submitted for the refund amount.', rule: 'The checker-poster must be a different user from the maker (segregation of duties).' });
});

// ───────────────────────── P04 Marketing Collections
proc('04-marketing-collections', 'Marketing Collections', 'MARKETING COLLECTIONS - Process Flow.pdf', 'collections → fin.head', 'Premium receivable list by stage, marketing diary, credit-term extension under approval and statement of account.');
await attempt('clxn', async () => {
  await as('nb.officer', async () => { await newClient(`Bayan Traders ${stamp}`); policyB = await issuePolicy(`Bayan Traders ${stamp}`, 'MTR-CTPL · Motor CTPL', '100000'); });
  await approve('uw.head', new RegExp(policyB));
  await as('collections', async () => {
    await nav('Collections').click();
    const r = () => row(new RegExp(policyB));
    await shot('PR list: newly booked accounts to collect within 10–15 days; ageing and collection stage per invoice', 'Collections › Outstanding premium', {
      action: 'Open Collections; the outstanding register lists every unpaid invoice.',
      result: 'Each row shows days since booking, days overdue, ageing bucket and the collection stage (newly booked, within credit term, committed, overdue, escalate).',
      rule: 'Newly booked accounts are collected within 10–15 days; commitments must fall within the 60-day credit term.',
      focus: r });
    await r().getByRole('button', { name: 'SOA' }).click(); await page.getByRole('heading', { name: /Statement of account/ }).waitFor();
    await shot('Statement of account sent to the client', 'Collections › SOA', {
      action: 'Press SOA on the invoice row.',
      result: 'The statement lists all open invoices of the client with balances and ageing, ready to send.',
      rule: 'SOA is the collection instrument for account-level follow-up.',
      focus: () => page.getByRole('heading', { name: /Statement of account/ }).locator('..').locator('..') });
    await page.getByRole('heading', { name: /Statement of account/ }).locator('..').getByRole('button', { name: 'Close' }).click();
    await r().getByRole('button', { name: 'Log effort' }).click();
    await page.getByLabel('Category').selectOption('committed');
    const c = new Date(); c.setUTCDate(c.getUTCDate() + 45); const commit = c.toISOString().slice(0, 10); await page.getByLabel('Commitment date').fill(commit);
    await page.getByLabel('Contact person').fill('Ms. Reyes');
    await shot('Marketing diary: when / where / how / what of each collection effort, commitment date and arrangement', 'Collections › Log effort', {
      action: 'Press Log effort and record the contact.',
      inputs: ['Category: committed', `Commitment date: ${commit} (45 days out)`, 'Contact person: Ms. Reyes', 'Mode / arrangement / remarks: as agreed with the client'],
      result: 'The effort is added to the diary and the invoice stage is recomputed.',
      rule: 'Every effort captures when, where, how and what, so the diary is auditable.',
      focus: () => page.locator('form.card') });
    await page.locator('form.card').getByRole('button', { name: 'Log effort' }).click(); await expectToast(/beyond the credit term/);
    await shot('Commitment beyond the 60-day credit term: MAO informed, tagged as committed', 'Collections › Outstanding premium', {
      action: 'Read the toast after logging.',
      result: 'Toast warns the commitment is beyond the credit term and that the MAO was emailed; stage becomes committed.',
      rule: 'A commitment past the credit term requires a credit-term extension (CTE) approved by the unit head.',
      focus: r });
    answers = [[/days/i, '30'], [/reason|why/i, 'Client budget cycle']];
    await r().getByRole('button', { name: 'CTE' }).click(); await expectToast(/CTE requested/);
    await shot('Credit-term extension (CTE) requested for Unit Head approval', 'Collections › CTE', {
      action: 'Press CTE and answer the prompts.',
      inputs: ['Extension: 30 days', 'Reason: Client budget cycle'],
      result: 'A cte approval request is raised; the invoice shows the pending extension.',
      rule: 'CTE extends the due date only after approval; the request is maker-checker.',
      focus: r });
    await r().getByRole('button', { name: 'Diary' }).click(); await page.getByRole('heading', { name: /^Diary/ }).waitFor();
    await shot('Effort diary per invoice with category tagging', 'Collections › Diary', {
      action: 'Press Diary on the row.',
      result: 'All efforts for the invoice, with mode, category, commitment, arrangement, contact and who logged it.',
      rule: 'Tagging status / category drives the escalation stage.',
      focus: () => page.getByRole('heading', { name: /^Diary/ }).locator('..').locator('..') });
  });
  await approve('fin.head', /Credit-term extension/, { shots: true, before: 'Unit / Finance Head reviews the CTE request', after: 'CTE approved: due date extended and account stays within term', afterResult: 'Invoice due date extended by the approved days; stage returns to within credit term / committed.' });
});

// ───────────────────────── P05 FRBS Accounting
proc('05-frbs-accounting', 'FRBS Accounting', 'FRBS - ACCOUNTING.pdf', 'accountant → fin.head', 'Chart of accounts, system-generated journals, manual entries under review, trial balance, period and year-end closing.');
await attempt('acct', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Journals').click();
    await shot('System-generated journals (booking, receipts, commissions) and manual entry form routed to the TL for posting', 'Accounting & Disbursement › Journals', {
      action: 'Open the Journals tab: the register lists automatic journals; the form drafts a manual entry.',
      inputs: ['Entry date, description', 'Lines: account, debit, credit (must balance)'],
      result: 'Route for posting raises a journal approval; system journals are already posted.',
      rule: 'Manual journals post only after the TL / FRBS approver decides; debits must equal credits.',
      focus: () => page.locator('main .card').first() });
    await tab('Trial balance').click();
    await shot('Trial balance and financial reports generated from the ledger', 'Accounting & Disbursement › Trial balance', {
      action: 'Open Trial balance; optionally filter by period (YYYY-MM).',
      result: 'Debit and credit totals per account with the balanced indicator.',
      rule: 'The ledger is double-entry; the trial balance must always balance.',
      focus: table });
    await tab('Periods & year-end').click();
    await shot('EOD / EOM / EOY: period close and reopen, fiscal-year close to retained earnings', 'Accounting & Disbursement › Periods & year-end', {
      action: 'Open Periods & year-end: close a month, reopen with a reason, or close the fiscal year.',
      inputs: ['Period: YYYY-MM to close', 'Reason to reopen: required when reopening', 'Year: fiscal year to close'],
      result: 'Closed periods reject new postings; the year-end close posts nominal balances to retained earnings.',
      rule: 'Only the Finance Head may reopen a closed period.',
      focus: () => page.locator('main .card').first() });
  });
});

// ───────────────────────── P06 Disbursement
proc('06-disbursement', 'Disbursement', 'DISBURSEMENT.pdf', 'accountant → admin (reviewer) → fin.head → accountant', 'Disbursement chain DPO → DTL → DSH → DUH with segregation of duties, payment posting and confirmation email; weekly remittance to insurers.');
await attempt('disb', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Remittances').click();
    await shot('Weekly remittance extract of applied payments per insurer, sanitised and submitted to Disbursement', 'Accounting & Disbursement › Remittances', {
      action: 'Open Remittances: the extract groups applied payments due to each insurer.',
      result: 'Per insurer: number of policies and net amount; Submit creates the remittance schedule and its disbursement request.',
      rule: 'Direct-paid and already-remitted policies are excluded from the extract.',
      focus: () => page.locator('main .card').first() });
    await tab('Disbursements').click();
    await page.getByLabel('Payee').fill(`Supplier ${stamp}`); await page.getByLabel('Amount (₱)').fill('1200');
    await shot('Disbursement request (DPO) with payee, amount, mode and bank details', 'Accounting & Disbursement › Disbursements › Request', {
      action: 'Fill in the disbursement request and press Request.',
      inputs: ['Type: supplier', `Payee: Supplier ${stamp}`, 'Amount: ₱1,200.00', 'Mode: cheque', 'Bank details: optional'],
      result: 'A voucher number is assigned in status pending review.',
      rule: 'The requester (DPO) cannot review or approve their own voucher.',
      focus: () => card('Request') });
    await page.getByRole('button', { name: 'Request', exact: true }).click(); await expectToast(/Disbursement requested/);
    await shot('Request awaits a reviewer other than the maker (segregation of duties)', 'Accounting & Disbursement › Disbursements', {
      action: 'Check the voucher row.',
      result: 'Status pending review; Review OK / Reject are hidden from the maker.',
      rule: 'Segregation of duties: maker, reviewer, approver and payer are distinct roles or users.',
      focus: () => row(new RegExp(`Supplier ${stamp}`)) });
  });
  await as('admin', async () => {
    await nav('Accounting & Disbursement').click();
    await row(new RegExp(`Supplier ${stamp}`)).getByRole('button', { name: 'Review OK' }).click(); await expectToast(/Finance Head/);
    await shot('Team lead review (DTL) OK; routed to the Finance Head for approval', 'Accounting & Disbursement › Disbursements › Review OK', {
      action: 'As the team lead, press Review OK on the voucher.',
      result: 'Status pending approval; a disbursement approval request is raised for the Finance Head.',
      rule: 'Review confirms supporting documents before approval.',
      focus: () => row(new RegExp(`Supplier ${stamp}`)) });
  });
  await approve('fin.head', new RegExp(`Supplier ${stamp}`), { shots: true, before: 'Finance Head (DSH / DUH) reviews the voucher', after: 'Approved; ready for payment', afterResult: 'Voucher status approved; the payer can now release payment.' });
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click();
    answers = [[/cheque|reference/i, `CHQ-PAY-${stamp}`]];
    await row(new RegExp(`Supplier ${stamp}`)).getByRole('button', { name: 'Pay' }).click(); await expectToast(/Paid, posted/);
    await shot('Payment posted with cheque reference; status tagged paid and confirmation email sent', 'Accounting & Disbursement › Disbursements › Pay', {
      action: 'Press Pay and enter the cheque / transaction reference.',
      inputs: [`Cheque / transaction reference: CHQ-PAY-${stamp}`],
      result: 'Status paid with timestamp; payment journal posted; confirmation email queued to the payee.',
      rule: 'Payment posts Cr Cash / Dr the payable account of the voucher type.',
      focus: () => row(new RegExp(`Supplier ${stamp}`)) });
  });
});

// ───────────────────────── P07 Refund request
proc('07-refund-request', 'Refund Request', 'REFUND REQUEST.pdf', 'accountant (TL) → fin.head (UH)', 'Refund Request Form raised from a cancellation, TL review, Unit Head sign-off and hand-off to the disbursement chain.');
await attempt('refund', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Refund requests').click();
    await shot('RRF register: refund raised by the endorsement with amount, mode and reason', 'Accounting & Disbursement › Refund requests', {
      action: 'Open Refund requests.',
      result: `RRF for ${policyA} in status submitted with amount ₱1,500.00, mode credit to account and the endorsement as reason.`,
      rule: 'The RRF carries the MAO who raised it; TL review must be by someone else.',
      focus: () => row(new RegExp(`Acme Freight ${stamp}`)) });
    await row(new RegExp(`Acme Freight ${stamp}`)).getByRole('button', { name: 'TL review OK' }).click(); await expectToast(/RRF reviewed/);
    await shot('Marketing TL reviews the RRF', 'Accounting & Disbursement › Refund requests › TL review OK', {
      action: 'Press TL review OK.',
      result: 'Status reviewed; UH approve becomes available to an approver.',
      rule: 'Review and approval are separate steps by separate people.',
      focus: () => row(new RegExp(`Acme Freight ${stamp}`)) });
  });
  await as('fin.head', async () => {
    await nav('Accounting & Disbursement').click(); await tab('Refund requests').click();
    await row(new RegExp(`Acme Freight ${stamp}`)).getByRole('button', { name: 'UH approve' }).click(); await expectToast(/disbursement request created/);
    await shot('Unit Head sign-off: a disbursement request is created for the refund', 'Accounting & Disbursement › Refund requests › UH approve', {
      action: 'As Unit Head, press UH approve.',
      result: 'Status approved and a refund disbursement voucher is created automatically.',
      rule: 'Refunds are paid only through the disbursement chain.',
      focus: () => row(new RegExp(`Acme Freight ${stamp}`)) });
    await tab('Disbursements').click();
    await shot('Refund enters the disbursement chain (review → approve → pay)', 'Accounting & Disbursement › Disbursements', {
      action: 'Open Disbursements and find the refund voucher.',
      result: 'Type refund, payee the client, status pending review.',
      rule: 'Same DPO → DTL → DSH → DUH chain as any other disbursement.',
      focus: () => page.getByRole('row', { name: /refund/ }).first() });
  });
});

// ───────────────────────── P08 ACSL
proc('08-acsl', 'ACSL (Insurer SOA reconciliation)', 'ACSL.pdf', 'accountant → fin.head', 'Insurer statement of account reconciled against the ledger; abnormal balances raise adjustment entries reviewed by the TL and posted by the FRBS approver.');
await attempt('acsl', async () => {
  await as('accountant', async () => {
    await nav('Accounting & Disbursement').click(); await tab('ACSL / SOA recon').click();
    await page.getByLabel('Insurer').selectOption({ index: 1 });
    await page.getByLabel(/SOA lines/).fill(`${policyA}, 12000\nPOL-9999-00002, 500`);
    await shot('Insurer SOA lines captured against the ledger', 'Accounting & Disbursement › ACSL / SOA recon', {
      action: 'Choose the insurer, paste the statement lines and press Reconcile.',
      inputs: ['Insurer: first insurer on the panel', `SOA lines: ${policyA}, 12000  /  POL-9999-00002, 500`],
      result: 'A reconciliation run compares each statement line with the ledger balance for the policy.',
      rule: 'Statement total, ledger total and variance are stored per run.',
      focus: () => card('Reconcile') });
    await page.getByRole('button', { name: 'Reconcile' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Variances flagged (abnormal balances, unknown items) for manual subsidiary-ledger adjustment', 'Accounting & Disbursement › ACSL / SOA recon › Result', {
      action: 'Read the run: per policy statement vs ledger, variance and whether the policy is known.',
      result: 'Lines with variance or unknown policies are flagged; Adjust drafts the correcting entries.',
      rule: 'Adjustment entries are routed to the FRBS approver; nothing posts directly from the recon.',
      focus: () => page.locator('main .card').last() });
    const adjBtn = page.getByRole('button', { name: /Adjust/ }).first();
    if (await adjBtn.count()) { await adjBtn.click(); await shot('Adjustment entries drafted, routed to the FRBS approver for posting', 'Accounting & Disbursement › ACSL / SOA recon › Adjustment', { action: 'Press Adjust on the run and draft the balancing lines.', result: 'Adjustment journal raised for approval.', rule: 'TL review then FRBS approver posting.', focus: () => page.locator('form.card').last() }); }
  });
});

// ───────────────────────── P09 Claims
proc('09-claims', 'Claims', 'CLAIMS PROCESS FLOW.pdf', 'claims → fin.head', 'Notice of loss, PLA, document checklist, FLA to the insurer, evaluation and offer, contest loop, settlement approval and closure.');
await attempt('claims', async () => {
  await as('claims', async () => {
    await nav('Claims').click();
    await page.getByLabel('Policy number').fill(policyA); await page.getByLabel('Estimated amount (₱)').fill('50000'); await page.getByLabel('Description').fill('Collision on C5 southbound');
    await shot('Notice of loss registered against the policy (Claims Acceptance Control checks premium status)', 'Claims › Register', {
      action: 'Fill in the notice of loss and press Register.',
      inputs: [`Policy number: ${policyA}`, 'Date of loss: today', 'Estimated amount: ₱50,000.00', 'Description: Collision on C5 southbound'],
      result: 'Claims Acceptance Control checks the policy is in force and the premium is paid before accepting.',
      rule: 'CAC: an unpaid premium or a cancelled policy blocks registration with an explicit reason.',
      focus: () => card('Register') });
    await page.getByRole('button', { name: 'Register' }).click(); await expectToast(/Preliminary Loss Advice/);
    await shot('Preliminary Loss Advice (PLA) sent; claim opened with reserve', 'Claims › Register', {
      action: 'Read the toast and the new claim row.',
      result: 'Claim CLM-YYYY-NNNNN registered, reserve set to the estimate and the PLA emailed to the client.',
      rule: 'The document checklist is generated by line of business (motor vs non-motor CRF).',
      focus: () => row(new RegExp(policyA)) });
    await row(new RegExp(policyA)).click(); await dlg().waitFor();
    await shot('Document checklist by line (motor / non-motor); FLA blocked until complete', 'Claims › Claim detail › Document checklist', {
      action: 'Click the claim row to open the detail drawer.',
      result: 'Checklist rows (claim form, police report, licence, OR/CR, photos, estimate) all pending; the FLA button is not offered yet.',
      rule: 'Formal Loss Advice cannot be sent until every required document is received.',
      focus: dlg });
    const total = await dlg().getByRole('button', { name: 'Received' }).count();
    for (let i = 0; i < total; i++) { await dlg().getByRole('button', { name: 'Received' }).first().click(); await dlg().getByRole('button', { name: 'Unmark' }).nth(i).waitFor(); }
    await shot('All requirements received: documents complete', 'Claims › Claim detail', {
      action: 'Press Received on each checklist row as documents arrive.',
      result: 'Pill shows documents complete; Send Formal Loss Advice appears.',
      rule: 'Received dates are kept per document for TAT reporting.',
      focus: dlg });
    answers = [];
    await dlg().getByRole('button', { name: 'Send Formal Loss Advice' }).click(); await expectToast(/fla sent/);
    await shot('Formal Loss Advice sent to the insurer; adjuster inspection flagged', 'Claims › Claim detail › Send FLA', {
      action: 'Press Send Formal Loss Advice and confirm whether an adjuster inspection is needed.',
      inputs: ['Adjuster inspection needed? Yes'],
      result: 'Status fla sent; adjuster pill shown; FLA emailed to the insurer.',
      rule: 'Adjuster requirement is recorded for follow-up with the insurer.',
      focus: dlg });
    await dlg().getByRole('button', { name: 'Insurer evaluating' }).click(); await expectToast(/under review/);
    answers = [[/Offer amount/i, '40000'], [/position|contest/i, 'Estimate is 45000']];
    await dlg().getByRole('button', { name: 'Offer received' }).click(); await expectToast(/offer received/);
    await shot('Insurer evaluation and offer received', 'Claims › Claim detail › Offer received', {
      action: 'Press Insurer evaluating, then Offer received and enter the offer amount.',
      inputs: ['Offer amount: ₱40,000.00'],
      result: 'Status offer received with the offer stored against the reserve.',
      rule: 'Offer below estimate can be contested; acceptance closes the evaluation loop.',
      focus: dlg });
    await dlg().getByRole('button', { name: 'Contest offer' }).click(); await expectToast(/offer contested/);
    await shot('Insured contests the offer; re-evaluation loop with the insurer', 'Claims › Claim detail › Contest offer', {
      action: 'Press Contest offer and state the position.',
      inputs: ['Position: Estimate is 45000'],
      result: 'Status offer contested; the insurer re-evaluates and a new offer can be recorded.',
      rule: 'The contest loop can repeat until the insured accepts or the claim is declined.',
      focus: dlg });
    await dlg().getByRole('button', { name: 'Offer received' }).click(); await expectToast(/offer received/);
    await dlg().getByRole('button', { name: 'Insured accepts' }).click(); await expectToast(/offer accepted/);
    await dlg().getByRole('button', { name: 'Request settlement approval' }).click(); await expectToast(/settlement requested/);
    await shot('Settlement by LOA to casa/dealer or cash requested for approval', 'Claims › Claim detail › Request settlement approval', {
      action: 'After Insured accepts, press Request settlement approval and choose LOA or cash.',
      inputs: ['Settle by LOA to casa/dealer? Yes (Cancel = cash)'],
      result: 'Status settlement requested; a claim_settlement approval is raised.',
      rule: 'Settlement mode (LOA vs cash) is recorded; approval is maker-checker.',
      focus: dlg });
    await page.getByRole('button', { name: 'Close' }).first().click();
  });
  await approve('fin.head', /Settle CLM-/, { shots: true, before: 'Approver reviews the settlement', after: 'Settlement approved', afterResult: 'Claim status settlement approved; the claims officer can mark it settled / paid.' });
  await as('claims', async () => {
    await nav('Claims').click(); await row(new RegExp(policyA)).click(); await dlg().waitFor();
    await dlg().getByRole('button', { name: 'Mark settled / paid' }).click(); await expectToast(/settled/);
    await shot('Claim tagged settled / paid, then closed; declination is the alternative exit', 'Claims › Claim detail › Mark settled', {
      action: 'Reopen the claim and press Mark settled / paid.',
      result: 'Status settled with paid amount; Close finishes the claim.',
      rule: 'Decline (with reason) is available at any open stage as the alternative exit.',
      focus: dlg });
  });
});

// ───────────────────────── P10 Case management
proc('10-case-management', 'Case Management (To-Be)', 'CASE MANAGEMENT TO BE PROCESS FLOW_07152026.pdf', 'compliance', 'General vs account-related inquiries, positive identification, point-of-contact handling or referral to the fulfilment unit, TAT monitoring and return to CCC.');
await attempt('cases', async () => {
  await as('compliance', async () => {
    await nav('Customer Servicing').click();
    await page.getByLabel('Concern').selectOption('inquiry'); await page.getByLabel('Description').fill('What are your office hours?');
    await shot('Contact logged: general inquiry (no client) vs account-related concern', 'Customer Servicing › Cases › Log case', {
      action: 'Log the contact: leave Client blank for a general inquiry, choose the concern and describe it.',
      inputs: ['Client: blank (general inquiry)', 'Channel: phone', 'Concern: General inquiry', 'Description: What are your office hours?', 'Handled at point of contact: yes'],
      result: 'The case is created and, being general, closed immediately.',
      rule: 'General inquiries close at point of contact; account-related concerns need PID.',
      focus: () => card('Log case') });
    await page.getByRole('button', { name: 'Log case' }).click(); await expectToast(/closed at point of contact/);
    await shot('General inquiry handled and closed at point of contact', 'Customer Servicing › Cases', {
      action: 'Read the toast and the case row.',
      result: 'Request number assigned; case type general; status closed.',
      rule: 'No TAT applies to a case closed at point of contact.',
      focus: () => row(/office hours/) });
    const sel = page.getByLabel(/Client \(blank/); const cv = await sel.locator('option', { hasText: `Acme Freight ${stamp}` }).getAttribute('value'); await sel.selectOption(cv);
    await page.getByLabel('Concern').selectOption('billing'); await page.getByLabel('Description').fill('Client disputes the amount on the latest invoice');
    await page.getByLabel('Positive identification').fill(emailA);
    await shot('Account-related concern: positive identification (PID) and routing to the owning unit with a TAT', 'Customer Servicing › Cases › Log case', {
      action: 'Select the client, choose the concern, describe it and quote the PID answer given by the caller.',
      inputs: [`Client: Acme Freight ${stamp}`, 'Concern: Billing (→ OPS)', 'Description: Client disputes the amount on the latest invoice', `Positive identification: ${emailA}`, 'TAT (hours): default for the category'],
      result: 'PID is verified against the registered TIN or email; the case is routed to Operations with a TAT due time.',
      rule: 'A failed PID blocks the case with reason PID_FAILED.',
      focus: () => card('Log case') });
    await page.getByRole('button', { name: 'Log case' }).click(); await page.locator('.toast').last().waitFor();
    const r = () => row(/disputes the amount/).first();
    await shot('Case referred to the fulfilment unit; TAT due time computed and past-TAT flagged', 'Customer Servicing › Cases', {
      action: 'Check the new case row.',
      result: 'Owning unit OPS, status open, TAT due timestamp; past-TAT cases are flagged on the dashboard.',
      rule: 'TAT monitoring: tat_due_at = logged time + category TAT hours.',
      focus: r });
    await r().getByRole('button', { name: /in progress/ }).click(); await page.locator('.toast').last().waitFor();
    answers = [[/Return reason/i, 'Mis-routed to billing; policy concern']];
    await r().getByRole('button', { name: 'Return to CCC' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Case returned to the Customer Contact Centre for re-logging with a reason', 'Customer Servicing › Cases › Return to CCC', {
      action: 'Press in progress, then Return to CCC and give the reason.',
      inputs: ['Return reason: Mis-routed to billing; policy concern'],
      result: 'Status returned with the reason stored; the fulfilment unit no longer owns it.',
      rule: 'Return is allowed from open or in progress only.',
      focus: r });
    await r().getByRole('button', { name: 'Re-log' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Case re-logged and back in the open queue', 'Customer Servicing › Cases › Re-log', {
      action: 'Press Re-log.',
      result: 'Status open again; the CCC re-routes it to the correct unit.',
      rule: 'Lifecycle: open → in progress → resolved → closed, with returned → open as the loop.',
      focus: r });
  });
});

// ───────────────────────── P11 Customer servicing facility
proc('11-customer-servicing-facility', 'Customer Servicing Facility', 'CUSTOMER SERVICING FACILITY - Process Flow.pdf', 'compliance', 'Search by invoice, policy or client name; view policies, invoices and receipts; update contact details.');
await attempt('csf', async () => {
  await as('compliance', async () => {
    await nav('Customer Servicing').click(); await tab('Servicing facility').click();
    await page.getByPlaceholder(/Invoice no., policy no./).fill('Acme'); await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Update contact' }).first().waitFor();
    await shot('Servicing facility: search by invoice no., policy no. or client name', 'Customer Servicing › Servicing facility', {
      action: 'Open Servicing facility, type an invoice number, policy number or client name and press Search.',
      inputs: ['Search: Acme'],
      result: 'Matching clients with their policies, invoices and receipts.',
      rule: 'Search is entitlement-scoped to the servicing modules.',
      focus: () => page.locator('main .card').first() });
    answers = [[/Email/i, `updated${stamp}@example.com`], [/Phone/i, '0917-555-0100']];
    await page.getByRole('button', { name: 'Update contact' }).first().click(); await page.locator('.toast').last().waitFor();
    await shot('Client contact details updated from the facility', 'Customer Servicing › Servicing facility › Update contact', {
      action: 'Press Update contact and enter the new email and phone.',
      inputs: [`Email: updated${stamp}@example.com`, 'Phone: 0917-555-0100'],
      result: 'Contact saved; the change is audited with before/after values.',
      rule: 'Contact updates are audited; PID applies before changes are accepted over the phone.',
      focus: () => page.locator('.toast').last() });
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
    const r = () => row(new RegExp(policyC));
    await shot('RMEL: policies expiring within 140 days, pending sanitation', 'Renewal › Pipeline', {
      action: 'Open Renewal; the pipeline is the renewal master expiry list.',
      result: `Policy ${policyC} (expiring in 30 days) listed as pending sanitation with its days-to-expiry.`,
      rule: 'RMEL window: 140 days before expiry.',
      focus: r });
    await r().getByRole('button', { name: 'For renewal', exact: true }).click(); await expectToast(/Dispositioned/);
    await shot('Sanitation: disposition for renewal / remarket / not for renewal (NRNS letter)', 'Renewal › For renewal', {
      action: 'Press For renewal (or Remarket, or Not for renewal with a reason).',
      result: 'Disposition stored; RA letter actions appear according to the timing rules.',
      rule: 'Not for renewal sends the NRNS letter automatically.',
      focus: r });
    await r().getByRole('button', { name: 'Initial RA (−70d)' }).click(); await expectToast(/Initial RA/);
    await shot('Initial renewal advice letter sent 70 days before expiry', 'Renewal › Initial RA', {
      action: 'Press Initial RA (−70d).',
      result: 'Initial renewal advice emailed to the client and logged as a notice.',
      rule: 'Initial RA is offered only once the policy is inside the 70-day window.',
      focus: r });
    await r().getByRole('button', { name: 'Final RA (−45d)' }).click(); await expectToast(/Final RA/);
    await shot('Final renewal advice letter sent 45 days before expiry', 'Renewal › Final RA', {
      action: 'Press Final RA (−45d).',
      result: 'Final renewal advice emailed; both notices show on the row.',
      rule: 'Final RA requires the initial RA to have been sent first.',
      focus: r });
    await r().getByRole('button', { name: 'Client accepted' }).click(); await expectToast(/acceptance recorded/);
    answers = [[/sum insured/i, '120000']];
    await r().getByRole('button', { name: 'Renew → placement' }).click(); await expectToast(/placed with insurer/);
    await shot('Client accepted: renewal policy enters placement and the e-policy cycle', 'Renewal › Renew → placement', {
      action: 'Press Client accepted, then Renew → placement and enter the renewal sum insured.',
      inputs: ['Renewal sum insured: ₱120,000.00'],
      result: 'A renewal policy is created in placement requested and linked to the expiring one.',
      rule: 'Renewal placement follows the same placement → booking → e-policy lifecycle as new business.',
      focus: r });
  });
});

// ───────────────────────── P13 Reinsurance
proc('13-reinsurance', 'Reinsurance', 'RENISURANCE PROCESS FLOW.pdf', 'ri.officer', 'Facultative request with 24-hour acknowledgement and 3-day slip TAT, underwriting information loop, reinsurer security rating, signed slips, closing and debit note; treaties and cessions.');
await attempt('ri', async () => {
  await as('ri.officer', async () => {
    await nav('Reinsurance').click();
    await page.getByLabel('Sum insured (₱)').fill('2000000000'); await page.getByLabel('Risk description').fill('Petrochemical plant, sum insured PHP 2B');
    await shot('Facultative placement request from marketing with the risk details', 'Reinsurance › Facultative placements › Request', {
      action: 'Fill in the facultative request and press Request placement.',
      inputs: ['Cedant / policy no.: optional', 'Sum insured: ₱2,000,000,000.00', 'Share sought: default', 'Risk description: Petrochemical plant, sum insured PHP 2B'],
      result: 'Request FAC-YYYY-NNNNN created in status requested.',
      rule: 'The 24-hour acknowledgement TAT starts at request time.',
      focus: () => card('Request placement') });
    await page.getByRole('button', { name: 'Request placement' }).click(); await expectToast(/acknowledge within 24h/);
    const r = () => row(/FAC-\d{4}-\d{5}/).first();
    await shot('Request logged; acknowledgement due within 24 hours (TAT flag)', 'Reinsurance › Facultative placements', {
      action: 'Check the request row.',
      result: 'Status requested with the acknowledgement due time; late rows are flagged.',
      rule: 'TAT: acknowledge within 24 hours, slip within 3 working days.',
      focus: r });
    await r().getByRole('button', { name: 'Acknowledge' }).click(); await expectToast(/acknowledged/);
    await shot('Acknowledged; slip due within 3 working days', 'Reinsurance › Acknowledge', {
      action: 'Press Acknowledge (or Info received / Return incomplete when underwriting information is missing).',
      result: 'Status acknowledged; slip due date computed.',
      rule: 'Incomplete underwriting information loops back to marketing with what is missing.',
      focus: r });
    await r().getByRole('button', { name: 'Prepare slip' }).click(); const slip = page.locator('form.card', { hasText: 'Facultative slip' }); await slip.waitFor();
    await slip.locator('tbody input:not([type=number]):not([type=checkbox])').first().fill('Munich Re');
    await slip.locator('input[type=number]').first().fill('1');
    await slip.locator('input[type=number]').nth(1).fill('250000');
    await slip.locator('input[type=checkbox]').first().check();
    await shot('Slip: reinsurers approached with security rating, share and signed-slip evidence', 'Reinsurance › Prepare slip', {
      action: 'Press Prepare slip, add each reinsurer with rating, share and premium, tick Signed slip, then Save slip.',
      inputs: ['Reinsurer: Munich Re', 'Rating: AA', 'Share: 1.00 (100%)', 'Premium: ₱250,000.00', 'Signed slip: yes'],
      result: 'Slip saved; placed share shown against the share sought.',
      rule: 'Security rating gate: reinsurers below the minimum rating are rejected; shares must total the sought share before closing.',
      focus: () => slip });
    await page.getByRole('button', { name: 'Save slip' }).click(); await expectToast(/slip prepared/);
    await r().getByRole('button', { name: /Close & debit note/ }).click(); await expectToast(/placed|debit note/i);
    await shot('Closing: placement closed and debit note issued to the cedant', 'Reinsurance › Close & debit note', {
      action: 'Press Close & debit note.',
      result: 'Status placed; closing recorded and the debit note emailed to the cedant.',
      rule: 'Closing requires signed slips for every line.',
      focus: r });
    await tab('Treaties & cessions').click();
    await shot('Treaty register and cessions with capacity monitoring', 'Reinsurance › Treaties & cessions', {
      action: 'Open Treaties & cessions: register treaties and cede policies.',
      inputs: ['Treaty: code, name, reinsurer, type (quota share / surplus / XOL / facultative), cession rate, capacity, period', 'Cession: policy no., treaty'],
      result: 'Cessions reduce remaining treaty capacity.',
      rule: 'A cession beyond capacity is refused.',
      focus: () => page.locator('main .card').first() });
  });
});

// ───────────────────────── P14 Submitted policies
proc('14-submitted-policies', 'Submitted Policies', 'Submitted Policies_Process Flow.pdf', 'accountant', 'Masterlist validation, matching and consolidation, adequacy review with IAAF findings, and hand-off to sanitation 150 days from expiry.');
await attempt('sp', async () => {
  await as('accountant', async () => {
    await nav('Submitted Policies').click();
    await page.getByLabel(/Insurer \(for matching\)/).selectOption({ index: 1 });
    await shot('Masterlist upload from the bank / insurer for validation and matching', 'Submitted Policies › Masterlist batches', {
      action: 'Choose the insurer for matching, paste or upload the masterlist CSV and press Run pipeline.',
      inputs: ['Insurer (for matching): first insurer on the panel', 'File: CSV of policy no, client, premium, insurer, expiry'],
      result: 'A batch is created and every row validated and matched against booked policies.',
      rule: 'Rows are classified matched / unmatched / duplicate before consolidation.',
      focus: () => page.locator('main .card').first() });
    await page.getByRole('button', { name: 'Run pipeline' }).click(); await expectToast(/masterlist/);
    await shot('Rows validated, matched and consolidated; each reviewed for adequacy', 'Submitted Policies › Masterlist batches › Run pipeline', {
      action: 'Open the batch: each row offers Adequate or Findings → IAAF.',
      result: 'Batch totals and per-row classification with adequacy pending.',
      rule: 'Adequacy compares sum insured with the loan / collateral value.',
      focus: () => page.locator('main .card').last() });
    answers = [[/Findings/i, 'Sum insured below loan value']];
    await page.getByRole('button', { name: 'Findings → IAAF' }).first().click(); await expectToast(/IAAF/);
    await shot('Findings recorded and an Insurance Adequacy Assessment Form (IAAF) issued', 'Submitted Policies › Findings → IAAF', {
      action: 'Press Findings → IAAF on a row and describe the finding.',
      inputs: ['Findings: Sum insured below loan value'],
      result: 'IAAF number issued and emailed; row marked with findings.',
      rule: 'Adequate rows need no IAAF.',
      focus: () => page.locator('.toast').last() });
    await tab('Expiring (150 days)').click();
    await shot('Policies 150 days from expiry sent to the sanitation handler for renewal / conversion opportunity', 'Submitted Policies › Expiring (150 days)', {
      action: 'Open Expiring (150 days).',
      result: 'Submitted policies expiring within 150 days, ready for the sanitation handler.',
      rule: 'Conversion opportunities proceed through New Business; NRNS cases are noted.',
      focus: table });
  });
});

// ───────────────────────── P15 Employee benefits
proc('15-employee-benefits', 'Employee Benefits', 'EMPLOYEE BENEFITS - Process Flow.pdf', 'eb.officer', 'Renewal advice, BOR, TOR with master list and utilisation released to insurers, comparative analysis, award with ISACOM for non-accredited providers, handoff.');
await attempt('eb', async () => {
  await as('eb.officer', async () => {
    await nav('Employee Benefits').click();
    await page.getByLabel('Corporate client').selectOption({ index: 1 }); await page.getByLabel('Incumbent insurer').selectOption({ index: 1 });
    await page.getByLabel('Plan').fill(`Gold HMO ${stamp}`); await page.getByLabel(/Indicative premium/).fill('12000');
    await shot('Prospect scheme created from the renewal advice', 'Employee Benefits › Create scheme', {
      action: 'Fill in the scheme and press Create scheme.',
      inputs: ['Corporate client: first corporate client', 'Incumbent insurer: first insurer', `Plan: Gold HMO ${stamp}`, 'Indicative premium per life: ₱12,000.00', 'Inception: default'],
      result: 'Scheme EB-YYYY-NNNNN created in status prospect.',
      rule: 'A scheme needs a BOR before insurers can be approached.',
      focus: () => card('Create scheme') });
    await page.getByRole('button', { name: 'Create scheme' }).click(); await expectToast(/Prospect scheme created/);
    await row(new RegExp(`Gold HMO ${stamp}`)).click(); await page.getByRole('button', { name: 'BOR received' }).waitFor();
    await page.getByRole('button', { name: 'BOR received' }).click(); await expectToast(/BOR received/);
    await page.getByRole('button', { name: 'TOR prepared' }).click(); await expectToast(/TOR prepared/);
    await page.getByRole('button', { name: 'Upload census' }).click(); await expectToast(/Census/);
    await shot('Broker of Record received, Terms of Reference prepared, member census uploaded', 'Employee Benefits › Scheme detail', {
      action: 'Open the scheme, press BOR received, TOR prepared, then paste the census and press Upload census.',
      inputs: ['Census rows: member no, name, birth date, dependents'],
      result: 'Scheme documents flagged; members listed with covered lives count.',
      rule: 'Master list and utilisation are part of the TOR pack.',
      focus: () => page.locator('main .card').last() });
    const multi = page.locator('select[multiple]');
    await multi.selectOption([{ index: 0 }, { index: 1 }]);
    await page.getByRole('button', { name: 'Release TOR to insurers' }).click(); await expectToast(/released to insurers/);
    await shot('TOR, master list and utilisation released to insurers (franchise)', 'Employee Benefits › Release TOR to insurers', {
      action: 'Select the insurers to approach and press Release TOR to insurers.',
      inputs: ['Insurers: first two on the panel (non-accredited ones are marked)'],
      result: 'Proposal requests created per insurer in status requested.',
      rule: 'Non-accredited insurers can quote but an award to them needs ISACOM approval.',
      focus: () => page.locator('main .card').last() });
    answers = [[/Premium/i, '11500'], [/Benefits/i, 'Room and board 4,000; MBL 150,000; dental'], [/Capabilities/i, '85']];
    await page.getByRole('button', { name: 'Record proposal' }).first().click(); await expectToast(/Proposal recorded/);
    answers = [[/Premium/i, '12800'], [/Benefits/i, 'Room and board 3,500; MBL 120,000'], [/Capabilities/i, '70']];
    const second = page.getByRole('button', { name: 'Record proposal' }).first(); if (await second.count()) { await second.click(); await expectToast(/Proposal recorded/); }
    await shot('Comparative analysis of proposals: premium, benefits and capabilities', 'Employee Benefits › Proposals', {
      action: 'Press Record proposal for each insurer and enter premium, benefits and capabilities score.',
      inputs: ['Insurer 1: ₱11,500 / life; Room and board 4,000; MBL 150,000; dental; capabilities 85', 'Insurer 2: ₱12,800 / life; Room and board 3,500; MBL 120,000; capabilities 70'],
      result: 'Proposals sorted by premium with benefits and capability score side by side.',
      rule: 'Comparative analysis covers premium, benefits and capabilities (stability, providers, technology).',
      focus: () => page.locator('main .card').last() });
    await page.getByRole('button', { name: 'Award' }).first().click(); await page.locator('.toast', { hasText: /Awarded|ISACOM/ }).last().waitFor();
    await shot('Client confirmation and award; ISACOM approval when the provider is not accredited; handoff to processing and collections', 'Employee Benefits › Award', {
      action: 'Press Award on the chosen proposal after client confirmation.',
      result: 'Scheme placed and the handoff email sent, or ISACOM approval requested when the insurer is not accredited.',
      rule: 'eb_award approval type gates non-accredited providers.',
      focus: () => page.locator('.toast').last() });
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
    await shot('PRF / TSU request for a non-packaged risk with completeness and duplicate check', 'Product Maintenance › TSU requests › Submit', {
      action: 'Fill in the TSU request and press Submit to TSU.',
      inputs: [`Client: Warehouse Corp ${stamp}`, 'Line: as selected', 'Sum insured: ₱30,000,000.00', 'Risk details: Warehouse complex, sprinklered, Class A construction'],
      result: 'Request TSU-YYYY-NNNNN created; duplicates for the same client and risk are rejected.',
      rule: 'Completeness and duplicate checks run on submission.',
      focus: () => card('Submit to TSU') });
    await page.getByRole('button', { name: 'Submit to TSU' }).click(); await expectToast(/TSU request submitted/);
    const tsuNo = (await row(/TSU-\d{4}-\d{5}/).first().textContent()).match(/TSU-\d{4}-\d{5}/)[0];
    const r = () => row(new RegExp(tsuNo));
    await r().getByRole('button', { name: 'Acknowledge' }).click(); await expectToast(/acknowledged/);
    await shot('TSU acknowledges the request (or returns it as incomplete)', 'Product Maintenance › TSU requests › Acknowledge', {
      action: 'Press Acknowledge on the request row (Return incomplete is the alternative).',
      result: `${tsuNo} acknowledged; Prepare quotation slip appears.`,
      rule: 'An incomplete request goes back to marketing and re-enters on Resubmitted.',
      focus: r });
    await r().click(); await page.getByRole('heading', { name: new RegExp(tsuNo) }).waitFor();
    answers = [[/Quotation slip/i, 'Fire and allied perils, PHP 30M, deductible 1%'], [/Premium quoted/i, '180000'], [/evidence/i, 'signed slip'], [/Conditions/i, 'Subject to survey'], [/Selected insurer id/i, '1'], [/Proposal slip/i, 'Malayan selected: best terms, no exceptions']];
    await r().getByRole('button', { name: 'Prepare quotation slip' }).click(); await page.locator('.toast').last().waitFor();
    await r().getByRole('button', { name: 'TL approve QS' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Quotation slip prepared and approved by the TL', 'Product Maintenance › TSU detail › TL approve QS', {
      action: 'Press Prepare quotation slip and describe the terms, then TL approve QS.',
      inputs: ['Quotation slip: Fire and allied perils, PHP 30M, deductible 1%'],
      result: 'Status qs approved; the slip can be referred to RI or sent to insurers.',
      rule: 'TL approve QS is available to approvers only (green button).',
      focus: r });
    await r().getByRole('button', { name: 'Refer to RI' }).click(); await page.locator('.toast').last().waitFor();
    await r().getByRole('button', { name: /RI cleared/ }).click(); await page.locator('.toast').last().waitFor();
    await shot('RI referral cleared; quotation slip sent to insurers', 'Product Maintenance › TSU detail › Send QS to insurers', {
      action: 'Press Refer to RI, then RI cleared → send to insurers.',
      result: 'Status sent to insurers; insurer responses can be recorded in the detail card.',
      rule: 'Risks above treaty capacity are referred to RI before quoting.',
      focus: r });
    await r().click(); const rec = page.getByRole('button', { name: 'Record response' }).first(); if (await rec.count()) { await rec.click(); await page.locator('.toast').last().waitFor(); }
    await r().getByRole('button', { name: 'Comparative table ready' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Insurer responses recorded (accepted with evidence / declined / conditional); comparative table ready', 'Product Maintenance › TSU detail › Comparative table', {
      action: 'Press Record response per insurer and enter premium, evidence and conditions; then Comparative table ready.',
      inputs: ['Premium quoted: ₱180,000.00', 'Acceptance evidence: signed slip', 'Conditions: Subject to survey'],
      result: 'Status comparative ready; responses listed for comparison.',
      rule: 'An acceptance without evidence (signed / stamped slip or explicit email) is not accepted.',
      focus: r });
    await r().getByRole('button', { name: 'Approve proposal slip' }).click(); await page.locator('.toast').last().waitFor();
    await shot('Proposal slip approved with the selected insurer; released to marketing and the client', 'Product Maintenance › TSU detail › Approve proposal slip', {
      action: 'Press Approve proposal slip, choose the insurer and describe the proposal.',
      inputs: ['Selected insurer id: 1', 'Proposal slip: Malayan selected: best terms, no exceptions'],
      result: 'Status proposal approved; New Business can now quote the non-packaged product against this proposal.',
      rule: 'A non-packaged quotation must reference an approved TSU proposal.',
      focus: r });
    await page.getByRole('button', { name: 'Close' }).first().click();
    await tab('Packages').click();
    answers = [[/^Field/i, 'commissionRate'], [/^New value/i, '0.16'], [/summary/i, `Commission uplift ${stamp}`]];
    await shot('Packaged product catalogue with rates, taxes and limits', 'Product Maintenance › Packages', {
      action: 'Open Packages: the catalogue of packaged products.',
      result: 'Each product shows base rate, commission, VAT/DST/LGT/FST, minimum premium, maximum sum insured and survey threshold.',
      rule: 'Changes to a product go through a maintenance request, never a direct edit.',
      focus: table });
    await row(/MTR-CTPL/).getByRole('button', { name: 'Change request' }).click(); await expectToast(/Maintenance request raised/);
    await shot('Package maintenance request raised for validation and approval', 'Product Maintenance › Packages › Change request', {
      action: 'Press Change request on the product and answer the prompts.',
      inputs: ['Field to change: commissionRate', 'New value: 0.16', `Change summary: Commission uplift ${stamp}`],
      result: 'A product_change approval is raised.',
      rule: 'Product changes are maker-checker and publish a release advisory on approval.',
      focus: () => row(/MTR-CTPL/) });
  });
  await approve('uw.head', new RegExp(`Commission uplift ${stamp}`), { shots: true, before: 'Approver validates the product change', after: 'Change applied and a release advisory published', afterResult: 'Product updated; release advisory recorded and emailed to the distribution list.' });
  await as('admin', async () => {
    await nav('Product Maintenance').click(); await tab('Insurers').click();
    await shot('Insurer panel with accreditation and SFTP enrolment for placement channels', 'Product Maintenance › Insurers', {
      action: 'Open Insurers to maintain the panel.',
      inputs: ['Code, insurer name, accredited, SFTP enrolled'],
      result: 'Accreditation drives ISACOM on EB awards; SFTP enrolment drives the placement channel.',
      rule: 'Only accredited insurers appear in the New Business insurer picker by default.',
      focus: table });
  });
});

// ───────────────────────── P01 BDOIR end-to-end (summary) + supporting
proc('01-bdoir-e2e', 'BDOIR End-to-End', 'BDOIR E2E PROCESS FLOW.pdf', 'admin', 'The umbrella flow that chains new business, cashiering, collections, remittance, disbursement, the general ledger, renewal and claims. Each link is captured in detail in its own process below; these screens show the control points that tie the chain together.');
await attempt('e2e', async () => {
  await as('admin', async () => {
    await shot('Executive dashboard: KPIs across the whole chain (in force, in placement, unapplied payments, pending approvals, disbursements in flight, past-TAT requests)', 'Dashboard', {
      action: 'Sign in; the dashboard opens.',
      result: 'KPI tiles for policies in force, in placement, premium and commission YTD, outstanding premium, unapplied payments, pending approvals, disbursements in flight, open claims, renewals due, past-TAT requests and screening hits.',
      rule: 'Each tile reads the same tables the processes write; there is no separate reporting copy.',
      focus: () => page.locator('main .grid').first() });
    await nav('Approvals & Audit').click(); await tab('All').click();
    await shot('Single maker-checker queue for bookings, endorsements, journals, disbursements, CTE, claim settlements, EB awards and product changes', 'Approvals & Audit › All', {
      action: 'Open Approvals & Audit and the All tab.',
      result: 'Every approval request across modules with maker, checker, status and note.',
      rule: 'One registry, eight request types, segregation of duties on all of them.',
      focus: table });
    await nav('Reports & Analytics').click();
    await shot('Production, collection and claims reports with CSV export', 'Reports & Analytics', {
      action: 'Open Reports & Analytics.',
      result: 'Production by product and insurer, collections ageing, claims by status, with CSV export.',
      rule: 'Reports are entitlement-scoped (RPT module).',
      focus: () => page.locator('main .card').first() });
    await nav('Sanction Screening & Risk').click();
    await shot('Client onboarding with sanctions screening, PEP flag and risk tiering feeding every process', 'Sanction Screening & Risk', {
      action: 'Open Sanction Screening & Risk.',
      result: 'Client register with screening status, PEP, risk score and tier; hits offer Clear (false positive) or Decline.',
      rule: 'Compliance decides hits; declined clients cannot transact.',
      focus: table });
    await nav('User Access Maintenance').click();
    await shot('Twelve personas with module entitlements and approver rights (segregation of duties)', 'User Access Maintenance', {
      action: 'Open User Access Maintenance.',
      result: 'Users with role, department, status and module entitlements; create user with a temporary password.',
      rule: 'Roles define modules and approver rights; menus and APIs enforce them.',
      focus: table });
    await nav('Data Migration').click();
    await shot('Legacy data migration batches with load, reconciliation and disposition', 'Data Migration', {
      action: 'Open Data Migration.',
      result: 'Batches with source count, loaded count, variance and disposition.',
      rule: 'A batch with variance requires a disposition before it is accepted.',
      focus: () => page.locator('main .card').first() });
  });
});

S.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), personas: PERSONAS, processes: S }, null, 2));
console.log('DONE', S.map((p) => `${p.id}: ${p.steps.length} shots, ${p.errors.length} errors`).join('\n'));
await browser.close();
