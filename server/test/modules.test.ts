import { describe, it, expect, afterAll } from 'vitest';
import { as, issuePolicy, newClient, payInvoice, insurerId, todayIso } from './helpers.js';
import { closePool } from '../src/db.js';

afterAll(closePool);

describe('sanction screening and risk', () => {
  it('blocks a sanctioned name from being quoted until compliance clears it', async () => {
    const hit = await newClient('nb.officer', 'Viktor Bout');
    expect(hit.screening.status).toBe('hit');
    expect(hit.screening.tier).toBe('high');
    const q = await as('nb.officer').post('/api/new-business/quotations', { clientId: hit.id, productId: 1, insurerId: 1, sumInsured: 100000, inceptionDate: todayIso() });
    expect(q.status).toBe(409);
    const notCompliance = await as('nb.officer').post(`/api/clients/${hit.id}/disposition`, { decision: 'clear', note: 'false positive' });
    expect(notCompliance.status).toBe(403);
    const cleared = await as('compliance').post(`/api/clients/${hit.id}/disposition`, { decision: 'clear', note: 'Different date of birth, false positive' });
    expect(cleared.status).toBe(200);
    const det = await as('compliance').get(`/api/clients/${hit.id}`);
    expect(det.body.client.screening_status).toBe('clear');
    expect(det.body.hits[0].decision).toBe('false_positive');
  });
  it('fuzzy and PEP handling', async () => {
    const fuzzy = await newClient('nb.officer', 'Victor Bout', { type: 'individual' });
    expect(['review', 'hit']).toContain(fuzzy.screening.status);
    const pep = await newClient('nb.officer', 'Clean Person', { type: 'individual', pep: true });
    expect(pep.screening.tier).toBe('medium');
    expect(pep.screening.cdd).toBe('standard');
  });
});

describe('product maintenance', () => {
  it('creates a product and rates it; acceptance bounds and survey flag', async () => {
    const pm = as('admin');
    const create = await pm.post('/api/products', { code: 'TEST-PA', name: 'Test PA', line: 'accident', baseRate: 0.002, minPremium: 800, commissionRate: 0.1, maxSumInsured: 1_000_000, surveyRequiredAbove: 500_000 });
    expect(create.status).toBe(201);
    const dup = await pm.post('/api/products', { code: 'TEST-PA', name: 'Dup', line: 'accident', baseRate: 0.002, commissionRate: 0.1 });
    expect(dup.status).toBe(409);
    const r = await pm.post(`/api/products/${create.body.id}/rate`, { sumInsured: 600_000 });
    expect(r.body.premium).toBe(1200);
    expect(r.body.surveyRequired).toBe(true);
    const over = await pm.post(`/api/products/${create.body.id}/rate`, { sumInsured: 2_000_000 });
    expect(over.status).toBe(409);
    expect((await as('cashier').post('/api/products', {})).status).toBe(403);
  });
});

describe('reinsurance', () => {
  it('cedes an in-force policy with rating gate and capacity check', async () => {
    const ri = as('ri.officer');
    const bad = await ri.post('/api/reinsurance/treaties', { code: 'BAD-RE', name: 'Weak', reinsurer: 'Weak Re', reinsurerRating: 'B', type: 'quota_share', cessionRate: 0.5, capacity: 1e9, inceptionDate: '2020-01-01', expiryDate: '2099-12-31' });
    expect(bad.status).toBe(409);
    const small = await ri.post('/api/reinsurance/treaties', { code: 'SMALL-QS', name: 'Small QS', reinsurer: 'Good Re', reinsurerRating: 'A', type: 'quota_share', cessionRate: 0.5, capacity: 600_000, inceptionDate: '2020-01-01', expiryDate: '2099-12-31' });
    expect(small.status).toBe(201);
    const client = await newClient('nb.officer', 'Cession Corp');
    const p = await issuePolicy(client.id, { sumInsured: 1_000_000 });
    const c1 = await ri.post('/api/reinsurance/cessions', { policyNo: p.policyNo, treatyId: small.body.id });
    expect(c1.status).toBe(201);
    expect(c1.body.cededSumInsured).toBe(500_000);
    expect(c1.body.cededPremium).toBe(6250);
    const p2 = await issuePolicy(client.id, { sumInsured: 1_000_000 });
    const c2 = await ri.post('/api/reinsurance/cessions', { policyNo: p2.policyNo, treatyId: small.body.id });
    expect(c2.status).toBe(409);
    expect(c2.body.error).toMatch(/capacity/i);
  });
});

describe('employee benefits', () => {
  it('scheme with census upload and member withdrawal', async () => {
    const client = await newClient('eb.officer', 'Group Employer Inc');
    const eb = as('eb.officer');
    const s = await eb.post('/api/employee-benefits/schemes', { clientId: client.id, insurerId: await insurerId('PRU'), planName: 'Gold HMO', perMemberPremium: 12000, inceptionDate: todayIso() });
    expect(s.status).toBe(201);
    const up = await eb.post(`/api/employee-benefits/schemes/${s.body.id}/members`, { members: [{ memberNo: 'E1', name: 'Alice', dependents: 2 }, { memberNo: 'E2', name: 'Bob' }] });
    expect(up.body).toEqual({ added: 2, updated: 0 });
    const det = await eb.get(`/api/employee-benefits/schemes/${s.body.id}`);
    expect(det.body.scheme.covered_lives).toBe(4);
    expect(det.body.scheme.annual_premium).toBe(48000);
    const m = det.body.members.find((x: any) => x.member_no === 'E1');
    expect((await eb.post(`/api/employee-benefits/schemes/${s.body.id}/members/${m.id}/withdraw`)).status).toBe(200);
    const det2 = await eb.get(`/api/employee-benefits/schemes/${s.body.id}`);
    expect(det2.body.scheme.covered_lives).toBe(1);
    const indiv = await newClient('eb.officer', 'Solo Person', { type: 'individual' });
    expect((await eb.post('/api/employee-benefits/schemes', { clientId: indiv.id, insurerId: 1, planName: 'Basic', perMemberPremium: 1, inceptionDate: todayIso() })).status).toBe(409);
  });
});

describe('customer servicing', () => {
  it('verifies caller identity and routes to the owning unit', async () => {
    const client = await newClient('nb.officer', 'Service Client Co');
    const cs = as('compliance');
    const phoneUnverified = await cs.post('/api/servicing/requests', { clientId: client.id, channel: 'phone', category: 'claims', description: 'Where is my claim?', verificationAnswer: 'wrong' });
    expect(phoneUnverified.status).toBe(409);
    const ok = await cs.post('/api/servicing/requests', { clientId: client.id, channel: 'phone', category: 'billing', description: 'Need my statement', verificationAnswer: 'serviceclientco@example.com' });
    expect(ok.status).toBe(201);
    expect(ok.body.owningUnit).toBe('OPS');
    expect(ok.body.identityVerified).toBe(true);
    expect((await cs.post(`/api/servicing/requests/${ok.body.id}/status`, { status: 'closed' })).status).toBe(409);
    expect((await cs.post(`/api/servicing/requests/${ok.body.id}/status`, { status: 'resolved' })).status).toBe(200);
    expect((await cs.post(`/api/servicing/requests/${ok.body.id}/status`, { status: 'closed' })).status).toBe(200);
  });
});

describe('submitted policies', () => {
  it('classifies a masterlist upload', async () => {
    const client = await newClient('nb.officer', 'Masterlist Co');
    const p = await issuePolicy(client.id, { product: 'MAR-CGO', insurer: 'STD', sumInsured: 3_000_000 });
    const res = await as('accountant').post('/api/submitted-policies/batches', { insurerId: await insurerId('STD'), fileName: 'std-sept.xlsx', rows: [
      { policyNo: p.policyNo.toLowerCase(), clientName: 'Masterlist Co', premium: 12000 },
      { policyNo: 'POL-1999-00001', clientName: 'Unknown', premium: 100 },
      { policyNo: p.policyNo, clientName: 'Masterlist Co', premium: null },
    ] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ masterlist: 1, fallout: 1, excluded: 1, renewal: 0 });
    const det = await as('accountant').get(`/api/submitted-policies/batches/${res.body.id}`);
    expect(det.body.rows[0].matched_policy_no).toBe(p.policyNo);
  });
});

describe('data migration', () => {
  it('reconciles count and value, requires disposition on variance', async () => {
    const dm = as('accountant');
    const b = await dm.post('/api/data-migration/batches', { entity: 'policies', sourceCount: 100, sourceValue: 250000 });
    expect(b.status).toBe(201);
    const bad = await dm.post(`/api/data-migration/batches/${b.body.id}/load`, { loadedCount: 99, loadedValue: 250000 });
    expect(bad.body.status).toBe('disposition_required');
    expect(bad.body.countVariance).toBe(-1);
    expect((await dm.post(`/api/data-migration/batches/${b.body.id}/disposition`, { note: 'One duplicate legacy row removed on purpose' })).status).toBe(200);
    const b2 = await dm.post('/api/data-migration/batches', { entity: 'clients', sourceCount: 10, sourceValue: 0 });
    const good = await dm.post(`/api/data-migration/batches/${b2.body.id}/load`, { loadedCount: 10, loadedValue: 0 });
    expect(good.body.status).toBe('reconciled');
  });
});

describe('accounting periods and manual journals', () => {
  it('closes and reopens a period; blocks posting into a closed period', async () => {
    const acc = as('accountant');
    const post = await acc.post('/api/accounting/journals', { entryDate: '2020-01-15', description: 'Legacy opening balance', lines: [{ accountCode: '1000', debit: 100 }, { accountCode: '3000', credit: 100 }] });
    expect(post.status).toBe(201);
    const unbalanced = await acc.post('/api/accounting/journals', { entryDate: '2020-01-15', description: 'Bad', lines: [{ accountCode: '1000', debit: 100 }, { accountCode: '3000', credit: 90 }] });
    expect(unbalanced.status).toBe(400);
    expect((await acc.post('/api/accounting/periods/2020-01/close')).status).toBe(200);
    const blocked = await acc.post('/api/accounting/journals', { entryDate: '2020-01-20', description: 'Late', lines: [{ accountCode: '1000', debit: 1 }, { accountCode: '3000', credit: 1 }] });
    expect(blocked.status).toBe(409);
    expect((await acc.post('/api/accounting/periods/2020-01/reopen', { reason: 'Late adjustment approved by finance head' })).status).toBe(200);
    const ok = await acc.post('/api/accounting/journals', { entryDate: '2020-01-20', description: 'Late', lines: [{ accountCode: '1000', debit: 1 }, { accountCode: '3000', credit: 1 }] });
    expect(ok.status).toBe(201);
    const journals = await acc.get('/api/accounting/journals?period=2020-01');
    expect(journals.body.journals.length).toBe(2);
    expect(journals.body.journals[0].lines).toHaveLength(2);
  });
});

describe('user access maintenance', () => {
  it('creates, disables and blocks self role change', async () => {
    const uam = as('admin');
    const c = await uam.post('/api/users', { username: 'temp.user', password: 'Temp@1234', fullName: 'Temp User', email: 'temp@brokerverse.local', roleCode: 'CASHIER', department: 'Ops' });
    expect(c.status).toBe(201);
    expect((await uam.post('/api/users', { username: 'temp.user', password: 'Temp@1234', fullName: 'Temp User', email: 'temp@brokerverse.local', roleCode: 'CASHIER' })).status).toBe(409);
    expect((await uam.patch(`/api/users/${c.body.id}`, { status: 'disabled' })).status).toBe(200);
    const me = await uam.get('/api/auth/me');
    expect((await uam.patch(`/api/users/${me.body.user.id}`, { roleCode: 'CASHIER' })).status).toBe(403);
    const login = await (await import('supertest')).default((await import('./helpers.js')).app).post('/api/auth/login').send({ username: 'temp.user', password: 'Temp@1234' });
    expect(login.status).toBe(403);
  });
});

describe('collections reminders', () => {
  it('sends a reminder for an unpaid invoice and refuses for a paid one', async () => {
    const client = await newClient('nb.officer', 'Reminder Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CTPL', sumInsured: 100_000 });
    expect((await as('collections').post(`/api/collections/reminders/${p.invoice.id}`)).status).toBe(200);
    await payInvoice(p.invoice.id, p.invoice.amount);
    expect((await as('collections').post(`/api/collections/reminders/${p.invoice.id}`)).status).toBe(409);
    const out = await as('collections').get('/api/collections/outstanding');
    expect(out.body.invoices.some((i: any) => i.policy_no === p.policyNo)).toBe(false);
  });
});
