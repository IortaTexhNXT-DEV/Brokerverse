import { describe, it, expect, afterAll } from 'vitest';
import { as, issuePolicy, newClient, insurerId, todayIso, daysFromNow, NB, UW } from './helpers.js';
import { closePool } from '../src/db.js';

afterAll(closePool);

describe('Reinsurance: treaties, cessions and facultative placement with TATs', () => {
  it('cedes with rating and capacity gates', async () => {
    const ri = as('ri.officer');
    expect((await ri.post('/api/reinsurance/treaties', { code: 'BAD-RE', name: 'Weak', reinsurer: 'Weak Re', reinsurerRating: 'B', type: 'quota_share', cessionRate: 0.5, capacity: 1e9, inceptionDate: '2020-01-01', expiryDate: '2099-12-31' })).status).toBe(409);
    const small = await ri.post('/api/reinsurance/treaties', { code: 'SMALL-QS', name: 'Small QS', reinsurer: 'Good Re', reinsurerRating: 'A', type: 'quota_share', cessionRate: 0.5, capacity: 600_000, inceptionDate: '2020-01-01', expiryDate: '2099-12-31' });
    const client = await newClient(NB, 'Cession Corp');
    const p = await issuePolicy(client.id, { sumInsured: 1_000_000 });
    const c1 = await ri.post('/api/reinsurance/cessions', { policyNo: p.policyNo, treatyId: small.body.id });
    expect(c1.body.cededSumInsured).toBe(500_000);
    const p2 = await issuePolicy(client.id, { sumInsured: 1_000_000 });
    expect((await ri.post('/api/reinsurance/cessions', { policyNo: p2.policyNo, treatyId: small.body.id })).body.error).toMatch(/capacity/i);
  });
  it('facultative placement: acknowledge (24h TAT), slip (3 working days), signed slips, closing and debit note', async () => {
    const ri = as('ri.officer');
    const req = await ri.post('/api/reinsurance/placements', { cedant: 'BDOI TSU', riskDescription: 'Petrochemical plant, sum insured PHP 2B', sumInsured: 2_000_000_000, requestedShare: 0.4 });
    expect(req.status).toBe(201);
    const step = (to: string, extra: Record<string, unknown> = {}) => ri.post(`/api/reinsurance/placements/${req.body.id}/transition`, { to, ...extra });
    expect((await step('slip_prepared')).status).toBe(409);
    expect((await step('acknowledged')).status).toBe(200);
    let det = await ri.get(`/api/reinsurance/placements/${req.body.id}`);
    expect(det.body.placement.slip_due_at).toBeTruthy();
    expect(det.body.placement.ack_overdue).toBe(false);
    expect((await step('slip_prepared', { lines: [{ reinsurer: 'Junk Re', rating: 'B', share: 0.4 }] })).status).toBe(409);
    expect((await step('slip_prepared', { lines: [{ reinsurer: 'Munich Re', rating: 'AA', share: 0.25, premium: 1_000_000, signedSlip: true }, { reinsurer: 'Swiss Re', rating: 'AA', share: 0.15, premium: 600_000 }] })).status).toBe(200);
    expect((await step('placed')).status).toBe(409); // unsigned slip
    await step('slip_prepared', { lines: [{ reinsurer: 'Munich Re', rating: 'AA', share: 0.25, premium: 1_000_000, signedSlip: true }, { reinsurer: 'Swiss Re', rating: 'AA', share: 0.10, premium: 400_000, signedSlip: true }] });
    expect((await step('placed')).body.error).toMatch(/placed of the/);
    await step('slip_prepared', { lines: [{ reinsurer: 'Munich Re', rating: 'AA', share: 0.25, premium: 1_000_000, signedSlip: true }, { reinsurer: 'Swiss Re', rating: 'AA', share: 0.15, premium: 600_000, signedSlip: true }] });
    const placed = await step('placed');
    expect(placed.status).toBe(200);
    expect(placed.body.debitNoteNo).toMatch(/^DN-/);
    det = await ri.get(`/api/reinsurance/placements/${req.body.id}`);
    expect(det.body.placement.placed_share).toBeCloseTo(0.4, 6);
  });
});

describe('Submitted policies: adequacy review, IAAF and expiry tracking', () => {
  it('classifies the masterlist, reviews adequacy and lists expiring submitted policies', async () => {
    const client = await newClient(NB, 'Masterlist Co');
    const p = await issuePolicy(client.id, { product: 'MAR-CGO', insurer: 'STD', sumInsured: 3_000_000 });
    const sp = as('accountant');
    const res = await sp.post('/api/submitted-policies/batches', { insurerId: await insurerId('STD'), fileName: 'std-sept.xlsx', rows: [
      { policyNo: p.policyNo.toLowerCase(), clientName: 'Masterlist Co', premium: 12000 },
      { policyNo: 'EXT-2026-77', clientName: 'Home Loan Borrower', premium: 8000, insurerName: 'Other Insurer', expiryDate: daysFromNow(100) },
      { policyNo: p.policyNo, clientName: 'Masterlist Co', premium: null },
    ] });
    expect(res.body).toMatchObject({ masterlist: 1, fallout: 1, excluded: 1 });
    const det = await sp.get(`/api/submitted-policies/batches/${res.body.id}`);
    const ext = det.body.rows.find((r: any) => r.policy_no_raw === 'EXT-2026-77');
    expect((await sp.post(`/api/submitted-policies/rows/${ext.id}/review`, { outcome: 'findings' })).status).toBe(409);
    const rev = await sp.post(`/api/submitted-policies/rows/${ext.id}/review`, { outcome: 'findings', findings: 'Sum insured below loan value' });
    expect(rev.body.status).toBe('iaaf_issued');
    expect(rev.body.iaafNo).toMatch(/^IAAF-/);
    const expiring = await sp.get('/api/submitted-policies/expiring');
    expect(expiring.body.window).toBe(150);
    expect(expiring.body.rows.some((r: any) => r.id === ext.id)).toBe(true);
  });
});

describe('Employee Benefits: BOR/TOR, remarketing, comparative and award', () => {
  it('requires BOR and TOR, compares proposals and needs ISACOM approval for a non-accredited provider', async () => {
    const client = await newClient('eb.officer', 'Group Employer Inc');
    const eb = as('eb.officer');
    const s = await eb.post('/api/employee-benefits/schemes', { clientId: client.id, insurerId: await insurerId('PRU'), planName: 'Gold HMO', perMemberPremium: 12000, inceptionDate: todayIso() });
    expect(s.status).toBe(201);
    await eb.post(`/api/employee-benefits/schemes/${s.body.id}/members`, { members: [{ memberNo: 'E1', name: 'Alice', dependents: 2 }, { memberNo: 'E2', name: 'Bob' }] });
    const pru = await insurerId('PRU'); const nac = await insurerId('NAC');
    expect((await eb.post(`/api/employee-benefits/schemes/${s.body.id}/proposals`, { insurerIds: [pru, nac] })).status).toBe(409);
    expect((await eb.post(`/api/employee-benefits/schemes/${s.body.id}/documents`, { borReceived: true, torPrepared: true })).status).toBe(200);
    expect((await eb.post(`/api/employee-benefits/schemes/${s.body.id}/proposals`, { insurerIds: [pru, nac] })).status).toBe(201);
    await eb.post(`/api/employee-benefits/schemes/${s.body.id}/proposals/${pru}`, { premiumPerLife: 11000, benefits: 'PHP 150k MBL', capabilitiesScore: 80 });
    await eb.post(`/api/employee-benefits/schemes/${s.body.id}/proposals/${nac}`, { premiumPerLife: 9000, benefits: 'PHP 120k MBL', capabilitiesScore: 60 });
    let det = await eb.get(`/api/employee-benefits/schemes/${s.body.id}`);
    expect(det.body.proposals[0].premium_per_life).toBe(9000); // comparative sorted by premium
    const award = await eb.post(`/api/employee-benefits/schemes/${s.body.id}/award`, { proposalId: det.body.proposals[0].id });
    expect(award.body.status).toBe('isacom_pending');
    expect((await as(UW).post(`/api/approvals/${award.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    det = await eb.get(`/api/employee-benefits/schemes/${s.body.id}`);
    expect(det.body.scheme.status).toBe('placed');
    expect(det.body.scheme.per_member_premium).toBe(9000);
    expect(det.body.scheme.annual_premium).toBe(36000);
  });
});

describe('Product maintenance: package changes are approved and published with a release advisory', () => {
  it('maker requests, checker approves, advisory emitted', async () => {
    const pm = as('admin');
    const create = await pm.post('/api/products', { code: 'TEST-PA', name: 'Test PA', line: 'accident', baseRate: 0.002, minPremium: 800, commissionRate: 0.1, maxSumInsured: 1_000_000, surveyRequiredAbove: 500_000 });
    expect(create.status).toBe(201);
    let list = await pm.get('/api/products');
    expect(list.body.products.find((p: any) => p.code === 'TEST-PA').status).toBe('retired');
    expect((await as(UW).post(`/api/approvals/${create.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    list = await pm.get('/api/products');
    expect(list.body.products.find((p: any) => p.code === 'TEST-PA').status).toBe('active');
    const chg = await pm.post(`/api/products/${create.body.id}/change-request`, { changes: { commissionRate: 0.12 }, summary: 'Commission uplift', effectiveDate: todayIso() });
    expect((await as(UW).post(`/api/approvals/${chg.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    const adv = await pm.get('/api/products/release-advisories');
    expect(adv.body.advisories.length).toBeGreaterThanOrEqual(2);
    expect(adv.body.advisories[0].summary).toBe('Commission uplift');
    const r = await pm.post(`/api/products/${create.body.id}/rate`, { sumInsured: 600_000 });
    expect(r.body.commission).toBe(144);
    expect(r.body.surveyRequired).toBe(true);
    expect((await as('cashier').post('/api/products', {})).status).toBe(403);
  });
});

describe('Screening, user access, data migration', () => {
  it('blocks a sanctioned name until compliance clears it', async () => {
    const hit = await newClient(NB, 'Viktor Bout');
    expect(hit.screening.status).toBe('hit');
    expect((await as(NB).post('/api/new-business/quotations', { clientId: hit.id, productId: 1, insurerId: 1, sumInsured: 100000, inceptionDate: todayIso() })).status).toBe(409);
    expect((await as(NB).post(`/api/clients/${hit.id}/disposition`, { decision: 'clear', note: 'false positive' })).status).toBe(403);
    expect((await as('compliance').post(`/api/clients/${hit.id}/disposition`, { decision: 'clear', note: 'Different date of birth, false positive' })).status).toBe(200);
    const pep = await newClient(NB, 'Clean Person', { type: 'individual', pep: true });
    expect(pep.screening).toMatchObject({ tier: 'medium', cdd: 'standard' });
  });
  it('joiner / mover / leaver with segregation of duties', async () => {
    const uam = as('admin');
    const c = await uam.post('/api/users', { username: 'temp.user', password: 'Temp@1234', fullName: 'Temp User', email: 'temp@brokerverse.local', roleCode: 'CASHIER', department: 'Ops' });
    expect(c.status).toBe(201);
    expect((await uam.patch(`/api/users/${c.body.id}`, { status: 'disabled' })).status).toBe(200);
    const me = await uam.get('/api/auth/me');
    expect((await uam.patch(`/api/users/${me.body.user.id}`, { roleCode: 'CASHIER' })).status).toBe(403);
  });
  it('reconciles migration batches on count and value', async () => {
    const dm = as('accountant');
    const b = await dm.post('/api/data-migration/batches', { entity: 'policies', sourceCount: 100, sourceValue: 250000 });
    const bad = await dm.post(`/api/data-migration/batches/${b.body.id}/load`, { loadedCount: 99, loadedValue: 250000 });
    expect(bad.body.status).toBe('disposition_required');
    expect((await dm.post(`/api/data-migration/batches/${b.body.id}/disposition`, { note: 'One duplicate legacy row removed on purpose' })).status).toBe(200);
  });
});
