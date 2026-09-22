import { describe, it, expect, afterAll } from 'vitest';
import { as, issuePolicy, newClient, payInvoice, insurerId, runDisbursement, daysFromNow, uniq, NB, CASHIER, ACCT, FIN, UW } from './helpers.js';
import { closePool } from '../src/db.js';

afterAll(closePool);

describe('Operations: cashiering channels, PDC monitoring and unapplied premium', () => {
  it('cash applies immediately with an official receipt; excess becomes unapplied premium (UPP)', async () => {
    const client = await newClient(NB, 'Cash Payer Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CTPL', sumInsured: 100_000 });
    const r = await payInvoice(p.invoice.id, p.invoice.amount + 100);
    expect(r.status).toBe('unapplied');
    expect(r.applied).toBe(p.invoice.amount);
    expect(r.unapplied).toBe(100);
    expect(r.receiptNo).toMatch(/^OR-/);
    expect(r.invoiceStatus).toBe('paid');
    const upp = await as(CASHIER).get('/api/operations/payments?status=unapplied');
    expect(upp.body.payments.some((x: any) => x.id === r.id)).toBe(true);
  });

  it('cheques are held four days before they can mature; bounced cheques are excluded', async () => {
    const client = await newClient(NB, 'Cheque Payer Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CTPL', sumInsured: 100_000 });
    const held = await as(CASHIER).post('/api/operations/payments', { invoiceId: p.invoice.id, amount: p.invoice.amount, channel: 'otc_cheque', chequeNo: '000111', chequeDate: daysFromNow(0) });
    expect(held.status).toBe(201);
    expect(held.body.status).toBe('held');
    expect((await as(CASHIER).post(`/api/operations/payments/${held.body.id}/mature`)).status).toBe(409);
    // A cheque received five days ago has cleared
    const old = await as(CASHIER).post('/api/operations/payments', { invoiceId: p.invoice.id, amount: 300, channel: 'otc_cheque', chequeNo: '000112', receivedAt: daysFromNow(-5) });
    const matured = await as(CASHIER).post(`/api/operations/payments/${old.body.id}/mature`);
    expect(matured.status).toBe(200);
    expect(matured.body.status).toBe('applied');
    expect(matured.body.invoiceStatus).toBe('partial');
    expect((await as(CASHIER).post(`/api/operations/payments/${held.body.id}/bounce`, { reason: 'Insufficient funds' })).status).toBe(200);
    const pm = await as(CASHIER).get('/api/operations/payments?status=bounced');
    expect(pm.body.payments[0].exclusion_reason).toMatch(/Bounced Check/);
  });

  it('unapplied premium is applied later to an invoice', async () => {
    const client = await newClient(NB, 'UPP Later Co');
    const pay = await as(CASHIER).post('/api/operations/payments', { clientId: client.id, amount: 5000, channel: 'bills_payment', reference: 'BP-1' });
    expect(pay.body.status).toBe('unapplied');
    const p = await issuePolicy(client.id, { product: 'MTR-CTPL', sumInsured: 100_000 });
    const applied = await as(CASHIER).post(`/api/operations/payments/${pay.body.id}/apply`, { invoiceId: p.invoice.id });
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(Math.min(5000, p.invoice.amount));
    expect(applied.body.receiptNo).toMatch(/^OR-/);
  });

  it('direct payment to insurer: commission receivable billed, approved and collected with a commission OR', async () => {
    const client = await newClient(NB, 'Direct Payer Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CMP', sumInsured: 1_000_000 });
    const dp = await as(CASHIER).post('/api/operations/direct-payments', { policyNo: p.policyNo, insurerReference: 'MAL-OR-1' });
    expect(dp.status).toBe(201);
    expect(dp.body.commission).toBe(1875);
    expect((await as(CASHIER).post('/api/operations/direct-payments', { policyNo: p.policyNo })).status).toBe(409);
    const out = await as('collections').get('/api/collections/outstanding');
    expect(out.body.invoices.some((i: any) => i.policy_no === p.policyNo)).toBe(false);
    const step = (to: string) => as('collections').post(`/api/operations/direct-payments/${dp.body.id}/transition`, { to });
    expect((await step('collected')).status).toBe(409);
    expect((await step('billed')).status).toBe(200);
    expect((await step('approved')).status).toBe(200);
    const collected = await step('collected');
    expect(collected.status).toBe(200);
    expect(collected.body.receiptNo).toMatch(/^OR-/);
    // Direct-paid policies are excluded from the insurer remittance extract
    const due = await as(ACCT).get('/api/accounting/remittances/due');
    expect((due.body.due.find((d: any) => d.insurer_name === 'Malayan Insurance')?.policy_ids ?? [])).not.toContain(p.policyId);
  });

  it('endorsements are posted by the checker; a cancellation with refund raises an RRF', async () => {
    const client = await newClient(NB, 'Endorse Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CMP', sumInsured: 1_000_000 });
    await payInvoice(p.invoice.id, p.invoice.amount);
    const adj = await as(CASHIER).post('/api/operations/endorsements', { policyNo: p.policyNo, type: 'adjustment', description: 'Add accessories cover', premiumDelta: 500 });
    expect(adj.status).toBe(201);
    expect((await as(UW).post(`/api/approvals/${adj.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    let det = await as(NB).get(`/api/new-business/policies/${p.policyId}`);
    expect(det.body.invoices[0].amount).toBe(p.invoice.amount + 500);
    expect(det.body.invoices[0].status).toBe('partial');
    const cancel = await as(CASHIER).post('/api/operations/endorsements', { policyNo: p.policyNo, type: 'cancellation', description: 'Vehicle sold', premiumDelta: -6000, refundAmount: 6000 });
    expect((await as(FIN).post(`/api/approvals/${cancel.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    det = await as(NB).get(`/api/new-business/policies/${p.policyId}`);
    expect(det.body.policy.status).toBe('cancelled');
    const refunds = await as(ACCT).get('/api/refunds');
    expect(refunds.body.refunds.some((r: any) => r.source_type === 'endorsement' && r.amount === 6000)).toBe(true);
  });

  it('production reconciliation classifies matched, discrepancy and unbooked', async () => {
    const client = await newClient(NB, 'Recon Co');
    const p = await issuePolicy(client.id, { product: 'MAR-CGO', insurer: 'STD', sumInsured: 3_000_000 });
    const rec = await as(CASHIER).post('/api/operations/production-recons', { insurerId: await insurerId('STD'), period: '2026-09', rows: [
      { policyNo: p.policyNo, premium: 12000 }, { policyNo: p.policyNo.toLowerCase(), premium: 11000, insurerRef: 'x' }, { policyNo: 'POL-1990-00001', premium: 100 },
    ] });
    expect(rec.status).toBe(201);
    expect(rec.body).toMatchObject({ matched: 1, discrepancy: 1, unbooked: 1 });
    const det = await as(CASHIER).get(`/api/operations/production-recons/${rec.body.id}`);
    const disc = det.body.rows.find((r: any) => r.status === 'discrepancy');
    expect(disc.variance).toBe(-1000);
    expect((await as(CASHIER).post(`/api/operations/production-recons/${rec.body.id}/rows/${disc.id}/disposition`, { disposition: 'Insurer applied a discount; endorsement raised' })).status).toBe(200);
  });
});

describe('Collections: marketing diary, stages and credit-term extension', () => {
  it('records efforts, flags commitments beyond the credit term, and extends terms via approval', async () => {
    const client = await newClient(NB, 'Slow Payer Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CTPL', sumInsured: 100_000 });
    const cx = as('collections');
    const out = await cx.get('/api/collections/outstanding');
    const row = out.body.invoices.find((i: any) => i.policy_no === p.policyNo);
    expect(row.stage).toBe('newly_booked');
    expect((await cx.post('/api/collections/efforts', { invoiceId: p.invoice.id, mode: 'call', category: 'committed' })).status).toBe(409);
    const effort = await cx.post('/api/collections/efforts', { invoiceId: p.invoice.id, mode: 'call', category: 'committed', commitmentDate: daysFromNow(45), contactPerson: 'Ms. Reyes', paymentArrangement: 'Deposit' });
    expect(effort.status).toBe(201);
    expect(effort.body.beyondCreditTerm).toBe(true);
    const cte = await cx.post('/api/collections/cte', { invoiceId: p.invoice.id, requestedDays: 30, reason: 'Client budget cycle' });
    expect(cte.status).toBe(201);
    expect((await cx.post('/api/collections/cte', { invoiceId: p.invoice.id, requestedDays: 30, reason: 'duplicate request' })).status).toBe(409);
    expect((await as(FIN).post(`/api/approvals/${cte.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    const list = await cx.get('/api/collections/cte');
    const done = list.body.extensions.find((x: any) => x.id === cte.body.id);
    expect(done.status).toBe('approved');
    expect(done.new_due_date > done.previous_due_date).toBe(true);
    const efforts = await cx.get(`/api/collections/efforts/${p.invoice.id}`);
    expect(efforts.body.efforts).toHaveLength(1);
  });
});

describe('Accounting, Disbursement, Refund and ACSL', () => {
  it('manual journals are drafted by the processor and posted by the TL; year-end closes nominal accounts', async () => {
    const acc = as(ACCT);
    const draft = await acc.post('/api/accounting/journals', { entryDate: '2019-03-15', description: 'Opening balances', lines: [{ accountCode: '1000', debit: 1000 }, { accountCode: '4100', credit: 1000 }] });
    expect(draft.status).toBe(201);
    expect((await acc.post('/api/accounting/journals', { entryDate: '2019-03-15', description: 'Bad', lines: [{ accountCode: '1000', debit: 100 }, { accountCode: '3000', credit: 90 }] })).status).toBe(409);
    expect((await as(FIN).post(`/api/approvals/${draft.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    const journals = await acc.get('/api/accounting/journals?period=2019-03');
    expect(journals.body.journals).toHaveLength(1);
    expect((await acc.post('/api/accounting/fiscal-years/2019/close')).status).toBe(409); // periods still open
    expect((await acc.post('/api/accounting/periods/2019-03/close')).status).toBe(200);
    const close = await acc.post('/api/accounting/fiscal-years/2019/close');
    expect(close.status).toBe(200);
    expect(close.body.netResult).toBe(1000);
    const tb = await acc.get('/api/accounting/trial-balance?period=2019-12');
    expect(tb.body.rows.find((r: any) => r.code === '3000').credit).toBe(1000);
    expect(tb.body.totals.debit).toBe(tb.body.totals.credit);
    // Nothing can post into a closed year
    const late = await acc.post('/api/accounting/journals', { entryDate: '2019-06-01', description: 'Late', lines: [{ accountCode: '1000', debit: 1 }, { accountCode: '3000', credit: 1 }] });
    expect((await as(FIN).post(`/api/approvals/${late.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(409);
    expect((await acc.post('/api/accounting/accounts', { code: '5300', name: 'Rent', type: 'expense' })).status).toBe(201);
    expect((await acc.post('/api/accounting/accounts', { code: '5300', name: 'Rent', type: 'expense' })).status).toBe(409);
  });

  it('remittance extract → submit to disbursement → review → approval → payment → journal and schedule email', async () => {
    const client = await newClient(NB, 'Remit Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CMP', insurer: 'FPG', sumInsured: 1_000_000 });
    await payInvoice(p.invoice.id, p.invoice.amount);
    const acc = as(ACCT);
    const due = await acc.get('/api/accounting/remittances/due');
    const fpg = due.body.due.find((d: any) => d.insurer_name === 'FPG Insurance');
    expect(fpg.policy_ids).toContain(p.policyId);
    const sched = await acc.post('/api/accounting/remittances', { insurerId: fpg.insurer_id, policyIds: [p.policyId] });
    expect(sched.status).toBe(201);
    expect(sched.body.amount).toBe(13781.25);
    const sub = await acc.post(`/api/accounting/remittances/${sched.body.id}/submit`);
    expect(sub.status).toBe(201);
    // Requester cannot review own disbursement; payment refused before approval
    expect((await acc.post(`/api/disbursements/${sub.body.disbursementId}/review`, { ok: true })).status).toBe(403);
    expect((await acc.post(`/api/disbursements/${sub.body.disbursementId}/pay`, { reference: 'x' })).status).toBe(409);
    const paid = await runDisbursement(sub.body.disbursementId, 'admin', FIN, ACCT);
    expect(paid.jvNo).toMatch(/^JV-/);
    const list = await acc.get('/api/accounting/remittances');
    expect(list.body.remittances.find((r: any) => r.id === sched.body.id).status).toBe('paid');
    const outbox = await as('admin').get('/api/outbox');
    expect(outbox.body.emails.some((e: any) => e.template === 'remittance-schedule')).toBe(true);
    expect(outbox.body.emails.some((e: any) => e.template === 'disbursement-confirmation')).toBe(true);
  });

  it('refund request: RRF → TL review → unit head approval → disbursement paid', async () => {
    const client = await newClient(NB, 'Refund Me Co');
    const pay = await as(CASHIER).post('/api/operations/payments', { clientId: client.id, amount: 2500, channel: 'otc_cash' });
    const rrf = await as(NB).post('/api/refunds', { clientId: client.id, paymentId: pay.body.id, amount: 2500, reason: 'Duplicate payment', paymentMode: 'credit_to_account', bankAccount: '0012-3456-78' });
    expect(rrf.status).toBe(201);
    expect((await as(NB).post('/api/refunds', { clientId: client.id, paymentId: pay.body.id, amount: 1, reason: 'Over refund', paymentMode: 'cheque' })).status).toBe(409);
    expect((await as(NB).post(`/api/refunds/${rrf.body.id}/review`, { ok: true })).status).toBe(403);
    expect((await as(FIN).post(`/api/refunds/${rrf.body.id}/approve`)).status).toBe(409); // must be reviewed first
    expect((await as('renewals').post(`/api/refunds/${rrf.body.id}/review`, { ok: true })).status).toBe(200);
    const appr = await as(UW).post(`/api/refunds/${rrf.body.id}/approve`);
    expect(appr.status).toBe(201);
    const paid = await runDisbursement(appr.body.disbursementId, ACCT, FIN, ACCT);
    expect(paid.jvNo).toMatch(/^JV-/);
    const list = await as(ACCT).get('/api/refunds');
    expect(list.body.refunds.find((r: any) => r.id === rrf.body.id).status).toBe('sent_to_disbursement');
  });

  it('other disbursements need a second reviewer and final approval', async () => {
    const d = await as(ACCT).post('/api/disbursements', { type: 'supplier', payeeName: 'Office Supplies Inc', amount: 1200, mode: 'online_banking' });
    expect(d.status).toBe(201);
    const rejected = await as('admin').post(`/api/disbursements/${d.body.id}/review`, { ok: false, note: 'No invoice attached' });
    expect(rejected.body.status).toBe('rejected');
  });

  it('ACSL: insurer SOA reconciliation flags a discrepancy and adjusts through a maker-checker journal', async () => {
    const client = await newClient(NB, 'SOA Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CTPL', insurer: 'STD', sumInsured: 100_000 });
    const acc = as(ACCT);
    const net = p.policy.total_amount - p.policy.commission;
    const balanced = await acc.post('/api/accounting/soa-recons', { insurerId: await insurerId('STD'), lines: [{ policyNo: p.policyNo, amount: net }] });
    expect(balanced.body.status).toBe('balanced');
    const disc = await acc.post('/api/accounting/soa-recons', { insurerId: await insurerId('STD'), lines: [{ policyNo: p.policyNo, amount: net + 10 }, { policyNo: `POL-UNKNOWN-${uniq()}`, amount: 5 }] });
    expect(disc.body.status).toBe('discrepancy');
    expect(disc.body.variance).toBe(15);
    const adj = await acc.post(`/api/accounting/soa-recons/${disc.body.id}/adjust`, { description: 'Insurer billed a fee', lines: [{ accountCode: '5100', debit: 15 }, { accountCode: '2100', credit: 15 }] });
    expect(adj.status).toBe(201);
    expect((await as(FIN).post(`/api/approvals/${adj.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    const list = await acc.get('/api/accounting/soa-recons');
    expect(list.body.recons.find((r: any) => r.id === disc.body.id).status).toBe('adjusted');
  });
});
