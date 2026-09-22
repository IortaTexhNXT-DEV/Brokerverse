import { describe, it, expect, afterAll } from 'vitest';
import { as, issuePolicy, newClient, payInvoice, productId, insurerId, todayIso, iso } from './helpers.js';
import { closePool } from '../src/db.js';

afterAll(closePool);

describe('one account threads the whole platform', () => {
  it('quote → bind → approve → invoice → receipt → collections → claim → remittance → ledger', async () => {
    const client = await newClient('nb.officer', 'Threaded Logistics Inc');
    expect(client.screening.status).toBe('clear');

    // Quote: rating engine applied
    const nb = as('nb.officer');
    const q = await nb.post('/api/new-business/quotations', { clientId: client.id, productId: await productId('MTR-CMP'), insurerId: await insurerId('MAL'), sumInsured: 1_000_000, inceptionDate: todayIso() });
    expect(q.status).toBe(201);
    expect(q.body.rating.premium).toBe(12500);
    expect(q.body.rating.total).toBe(15656.25);
    expect(q.body.rating.commission).toBe(1875);

    // Bind: maker-checker request raised, policy pending
    const bind = await nb.post(`/api/new-business/quotations/${q.body.id}/issue`, { note: 'please approve' });
    expect(bind.status).toBe(201);
    expect(bind.body.policyNo).toMatch(/^POL-\d{4}-\d{5}$/);
    const pending = await nb.get(`/api/new-business/policies/${bind.body.policyId}`);
    expect(pending.body.policy.status).toBe('pending_approval');
    expect(pending.body.invoices).toHaveLength(0);

    // Segregation of duties: maker cannot approve, non-checker cannot approve
    const selfApprove = await as('admin').post(`/api/approvals/${bind.body.approvalId}/decide`, { decision: 'approved' });
    expect(selfApprove.status).toBe(200); // admin is a different user and a checker
    // (re-issue another for the SoD assertion below)
    const q2 = await nb.post('/api/new-business/quotations', { clientId: client.id, productId: await productId('FIRE-RES'), insurerId: await insurerId('FPG'), sumInsured: 5_000_000, inceptionDate: todayIso() });
    const bind2 = await nb.post(`/api/new-business/quotations/${q2.body.id}/issue`);
    const notChecker = await nb.post(`/api/approvals/${bind2.body.approvalId}/decide`, { decision: 'approved' });
    expect(notChecker.status).toBe(403);
    const approve2 = await as('uw.head').post(`/api/approvals/${bind2.body.approvalId}/decide`, { decision: 'approved', note: 'ok' });
    expect(approve2.status).toBe(200);

    // Policy in force with invoice, journal and e-policy email
    const det = await nb.get(`/api/new-business/policies/${bind.body.policyId}`);
    expect(det.body.policy.status).toBe('in_force');
    expect(det.body.invoices).toHaveLength(1);
    expect(det.body.invoices[0].amount).toBe(15656.25);
    expect(det.body.journals).toHaveLength(1);
    const outbox = await as('admin').get('/api/outbox');
    expect(outbox.body.emails.some((e: any) => e.template === 'e-policy' && e.subject.includes(bind.body.policyNo))).toBe(true);

    // Claims Acceptance Control blocks a claim while premium is unpaid
    const blocked = await as('claims').post('/api/claims', { policyNo: bind.body.policyNo, lossDate: todayIso(), description: 'Collision on EDSA', estimatedAmount: 50000 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.code).toBe('CAC_UNPAID_PREMIUM');

    // Collections shows the balance
    const out1 = await as('collections').get('/api/collections/outstanding');
    const row = out1.body.invoices.find((i: any) => i.policy_no === bind.body.policyNo);
    expect(row.balance).toBe(15656.25);

    // Cashiering: partial then full receipt
    const inv = det.body.invoices[0];
    const over = await as('cashier').post('/api/operations/receipts', { invoiceId: inv.id, amount: 99999, method: 'cash' });
    expect(over.status).toBe(409);
    const r1 = await payInvoice(inv.id, 5656.25);
    expect(r1.invoiceStatus).toBe('partial');
    expect(r1.balance).toBe(10000);
    const r2 = await payInvoice(inv.id, 10000);
    expect(r2.invoiceStatus).toBe('paid');
    expect(r2.receiptNo).toMatch(/^OR-/);
    const soa = await as('collections').get(`/api/collections/statement/${client.id}`);
    expect(soa.body.receipts.length).toBeGreaterThanOrEqual(2);

    // Claim now accepted and moves through its lifecycle with settlement approval
    const claim = await as('claims').post('/api/claims', { policyNo: bind.body.policyNo, lossDate: todayIso(), description: 'Collision on EDSA', estimatedAmount: 50000 });
    expect(claim.status).toBe(201);
    expect(claim.body.claimNo).toMatch(/^CLM-/);
    const c = as('claims');
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'settled' })).status).toBe(409);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'under_review' })).status).toBe(200);
    const settle = await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'settlement_requested', amount: 42000, note: 'adjuster report' });
    expect(settle.status).toBe(200);
    expect(settle.body.approvalId).toBeTruthy();
    expect((await as('fin.head').post(`/api/approvals/${settle.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'settled' })).status).toBe(200);
    const cd = await c.get(`/api/claims/${claim.body.id}`);
    expect(cd.body.claim.status).toBe('settled');
    expect(cd.body.claim.paid_amount).toBe(42000);
    expect(cd.body.events.map((e: any) => e.event)).toEqual(['registered', 'under_review', 'settlement_requested', 'approved', 'settled']);

    // Remittance to insurer: due list, voucher, checker approval, payment journal
    const due = await as('accountant').get('/api/accounting/remittances/due');
    const mal = due.body.due.find((d: any) => d.insurer_name === 'Malayan Insurance');
    expect(mal.policy_ids).toContain(bind.body.policyId);
    const pv = await as('accountant').post('/api/accounting/remittances', { insurerId: mal.insurer_id, policyIds: [bind.body.policyId] });
    expect(pv.status).toBe(201);
    expect(pv.body.amount).toBe(13781.25);
    const early = await as('accountant').post(`/api/accounting/remittances/${pv.body.id}/pay`, { chequeNo: '000123' });
    expect(early.status).toBe(409);
    expect((await as('fin.head').post(`/api/approvals/${pv.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    const paid = await as('accountant').post(`/api/accounting/remittances/${pv.body.id}/pay`, { chequeNo: '000123' });
    expect(paid.status).toBe(200);
    expect(paid.body.jvNo).toMatch(/^JV-/);

    // Ledger balanced
    const tb = await as('accountant').get('/api/accounting/trial-balance');
    expect(tb.body.totals.debit).toBe(tb.body.totals.credit);
    expect(tb.body.totals.debit).toBeGreaterThan(0);

    // Dashboard and production report reflect it
    const dash = await as('admin').get('/api/reports/dashboard');
    expect(dash.body.kpis.policies_in_force).toBeGreaterThanOrEqual(2);
    const csv = await as('admin').get('/api/reports/production?format=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(bind.body.policyNo);

    // Audit trail is per action
    const audit = await as('admin').get(`/api/audit?entity=policy&entityId=${bind.body.policyId}`);
    expect(audit.body.entries.map((e: any) => e.action)).toEqual(expect.arrayContaining(['policy.bind', 'policy.issue']));
  });

  it('a rejected issuance leaves the policy rejected and raises no invoice', async () => {
    const client = await newClient('nb.officer', 'Rejected Ventures');
    const nb = as('nb.officer');
    const q = await nb.post('/api/new-business/quotations', { clientId: client.id, productId: await productId('MTR-CTPL'), insurerId: await insurerId('MAL'), sumInsured: 100_000, inceptionDate: todayIso() });
    const bind = await nb.post(`/api/new-business/quotations/${q.body.id}/issue`);
    const dec = await as('uw.head').post(`/api/approvals/${bind.body.approvalId}/decide`, { decision: 'rejected', note: 'incomplete docs' });
    expect(dec.status).toBe(200);
    const det = await nb.get(`/api/new-business/policies/${bind.body.policyId}`);
    expect(det.body.policy.status).toBe('rejected');
    expect(det.body.invoices).toHaveLength(0);
    const again = await as('uw.head').post(`/api/approvals/${bind.body.approvalId}/decide`, { decision: 'approved' });
    expect(again.status).toBe(409);
  });

  it('renewal pipeline: notices in order, renewal re-rated and approved, old policy marked renewed', async () => {
    const client = await newClient('nb.officer', 'Renewal Holdings');
    const inception = new Date(); inception.setUTCFullYear(inception.getUTCFullYear() - 1); inception.setUTCDate(inception.getUTCDate() + 30);
    const p = await issuePolicy(client.id, { inceptionDate: iso(inception), product: 'FIRE-RES', insurer: 'FPG', sumInsured: 2_000_000 });
    const rn = as('renewals');
    const pipe = await rn.get('/api/renewals/pipeline?days=60');
    expect(pipe.body.policies.some((x: any) => x.policy_no === p.policyNo)).toBe(true);
    expect((await rn.post(`/api/renewals/${p.policyId}/notice`, { noticeType: 'second' })).status).toBe(409);
    expect((await rn.post(`/api/renewals/${p.policyId}/notice`, { noticeType: 'first' })).status).toBe(201);
    expect((await rn.post(`/api/renewals/${p.policyId}/notice`, { noticeType: 'first' })).status).toBe(409);
    const ren = await rn.post(`/api/renewals/${p.policyId}/renew`, { sumInsured: 2_500_000 });
    expect(ren.status).toBe(201);
    expect(ren.body.premiumVariance).toBeGreaterThan(0);
    expect((await rn.post(`/api/renewals/${p.policyId}/renew`, {})).status).toBe(409);
    expect((await as('uw.head').post(`/api/approvals/${ren.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    const oldP = await as('nb.officer').get(`/api/new-business/policies/${p.policyId}`);
    expect(oldP.body.policy.status).toBe('renewed');
    const newP = await as('nb.officer').get(`/api/new-business/policies/${ren.body.policyId}`);
    expect(newP.body.policy.status).toBe('in_force');
    expect(newP.body.policy.inception_date > p.policy.expiry_date).toBe(true);
  });
});
