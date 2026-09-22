import { describe, it, expect, afterAll } from 'vitest';
import { as, issuePolicy, newClient, payInvoice, todayIso, iso, NB, CLAIMS, UW, FIN } from './helpers.js';
import { closePool } from '../src/db.js';

afterAll(closePool);

describe('Claims process: PLA → documents → FLA → evaluation → offer → settlement', () => {
  it('walks the motor claim swim lane with Claims Acceptance Control', async () => {
    const client = await newClient(NB, 'Motor Claimant Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CMP', sumInsured: 1_000_000 });
    const c = as(CLAIMS);
    const blocked = await c.post('/api/claims', { policyNo: p.policyNo, lossDate: todayIso(), description: 'Collision on EDSA', estimatedAmount: 50000 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.code).toBe('CAC_UNPAID_PREMIUM');
    await payInvoice(p.invoice.id, p.invoice.amount);
    const claim = await c.post('/api/claims', { policyNo: p.policyNo, lossDate: todayIso(), description: 'Collision on EDSA', estimatedAmount: 50000 });
    expect(claim.status).toBe(201);
    let det = await c.get(`/api/claims/${claim.body.id}`);
    expect(det.body.documents).toHaveLength(6);
    expect(det.body.claim.missing_documents).toBe(6);
    // FLA cannot go to the insurer until documents are complete
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'fla_sent' })).status).toBe(409);
    for (const d of det.body.documents) await c.post(`/api/claims/${claim.body.id}/documents`, { name: d.name, received: true });
    det = await c.get(`/api/claims/${claim.body.id}`);
    expect(det.body.claim.status).toBe('documents_complete');
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'fla_sent', adjusterRequired: true })).status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'under_review' })).status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'offer_received' })).status).toBe(409); // amount required
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'offer_received', amount: 40000, insurerClaimRef: 'MAL-C-1' })).status).toBe(200);
    // Insured contests → back to evaluation → revised offer → accepted
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'offer_contested', note: 'Repair estimate is PHP 45,000' })).status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'offer_received', amount: 45000 })).status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'offer_accepted' })).status).toBe(200);
    const settle = await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'settlement_requested', settlementMode: 'loa', note: 'LOA to preferred casa' });
    expect(settle.status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'settled' })).status).toBe(409);
    expect((await as(FIN).post(`/api/approvals/${settle.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'settled' })).status).toBe(200);
    expect((await c.post(`/api/claims/${claim.body.id}/transition`, { event: 'closed' })).status).toBe(200);
    det = await c.get(`/api/claims/${claim.body.id}`);
    expect(det.body.claim.paid_amount).toBe(45000);
    expect(det.body.claim.settlement_mode).toBe('loa');
    expect(det.body.events.map((e: any) => e.event)).toEqual(['registered', 'documents_complete', 'fla_sent', 'under_review', 'offer_received', 'offer_contested', 'offer_received', 'offer_accepted', 'settlement_requested', 'approved', 'settled', 'closed']);
    const outbox = await as('admin').get('/api/outbox');
    for (const t of ['preliminary-loss-advice', 'formal-loss-advice', 'claim-offer', 'claim-offer-contested', 'claim-settled']) expect(outbox.body.emails.some((e: any) => e.template === t)).toBe(true);
  });
  it('non-motor claims use the CRF checklist and can be declined', async () => {
    const client = await newClient(NB, 'Fire Claimant Co');
    const p = await issuePolicy(client.id, { product: 'FIRE-RES', insurer: 'FPG', sumInsured: 2_000_000 });
    await payInvoice(p.invoice.id, p.invoice.amount);
    const claim = await as(CLAIMS).post('/api/claims', { policyNo: p.policyNo, lossDate: todayIso(), description: 'Kitchen fire', estimatedAmount: 200000 });
    const det = await as(CLAIMS).get(`/api/claims/${claim.body.id}`);
    expect(det.body.documents.map((d: any) => d.name)).toContain('Claims Reporting Form (CRF)');
    expect((await as(CLAIMS).post(`/api/claims/${claim.body.id}/transition`, { event: 'declined', note: 'Excluded peril' })).status).toBe(200);
  });
});

describe('Case management (customer servicing)', () => {
  it('general inquiries close at point of contact; account cases need PID, route to the owning unit and carry a TAT', async () => {
    const client = await newClient(NB, 'Case Client Co');
    const cs = as('compliance');
    const general = await cs.post('/api/servicing/requests', { channel: 'phone', category: 'inquiry', description: 'What are your office hours?' });
    expect(general.status).toBe(201);
    expect(general.body).toMatchObject({ caseType: 'general_inquiry', status: 'closed' });
    const pidFail = await cs.post('/api/servicing/requests', { clientId: client.id, channel: 'phone', category: 'claims', description: 'Where is my claim?', verificationAnswer: 'wrong' });
    expect(pidFail.status).toBe(409);
    expect(pidFail.body.details.code).toBe('PID_FAILED');
    const routed = await cs.post('/api/servicing/requests', { clientId: client.id, channel: 'phone', category: 'billing', description: 'Need my statement', verificationAnswer: 'caseclientco@example.com', tatHours: 24 });
    expect(routed.status).toBe(201);
    expect(routed.body).toMatchObject({ owningUnit: 'OPS', identityVerified: true, status: 'open', caseType: 'account_related' });
    const atPoc = await cs.post('/api/servicing/requests', { clientId: client.id, channel: 'email', category: 'document', description: 'Resend my policy copy', verificationAnswer: 'caseclientco@example.com', handledAtPointOfContact: true });
    expect(atPoc.body.status).toBe('closed');
    // Fulfilment returns a mis-routed case; contact centre re-logs it
    expect((await cs.post(`/api/servicing/requests/${routed.body.id}/status`, { status: 'returned' })).status).toBe(409);
    expect((await cs.post(`/api/servicing/requests/${routed.body.id}/status`, { status: 'returned', reason: 'This is a claims matter' })).status).toBe(200);
    expect((await cs.post(`/api/servicing/requests/${routed.body.id}/status`, { status: 'open' })).status).toBe(200);
    expect((await cs.post(`/api/servicing/requests/${routed.body.id}/status`, { status: 'resolved' })).status).toBe(200);
    expect((await cs.post(`/api/servicing/requests/${routed.body.id}/status`, { status: 'closed' })).status).toBe(200);
    const list = await cs.get('/api/servicing/requests?status=closed');
    expect(list.body.requests.find((r: any) => r.id === routed.body.id).past_tat).toBe(false);
  });
  it('servicing facility: search by invoice/policy/name and update contact details', async () => {
    const client = await newClient(NB, 'Searchable Client Co');
    const p = await issuePolicy(client.id, { product: 'MTR-CTPL', sumInsured: 100_000 });
    const cs = as('compliance');
    const byInvoice = await cs.get(`/api/servicing/search?q=${p.invoice.invoice_no}`);
    expect(byInvoice.body.invoices[0].client_name).toBe('Searchable Client Co');
    const byPolicy = await cs.get(`/api/servicing/search?q=${p.policyNo}`);
    expect(byPolicy.body.policies[0].policy_no).toBe(p.policyNo);
    expect((await cs.patch(`/api/servicing/clients/${client.id}/contact`, { phone: '+63 917 000 0000' })).status).toBe(200);
    const det = await cs.get(`/api/clients/${client.id}`);
    expect(det.body.client.phone).toBe('+63 917 000 0000');
  });
});

describe('Renewal process (RMEL): disposition, timed notices, client acceptance, placement', () => {
  it('enforces the −140 / −70 / −45 day rules and the acceptance gate', async () => {
    const client = await newClient(NB, 'Renewal Holdings');
    const inception = new Date(); inception.setUTCFullYear(inception.getUTCFullYear() - 1); inception.setUTCDate(inception.getUTCDate() + 100); // expires in ~99 days
    const p = await issuePolicy(client.id, { inceptionDate: iso(inception), product: 'FIRE-RES', insurer: 'FPG', sumInsured: 2_000_000 });
    const rn = as('renewals');
    const pipe = await rn.get('/api/renewals/pipeline');
    expect(pipe.body.window).toBe(140);
    expect(pipe.body.policies.some((x: any) => x.policy_no === p.policyNo)).toBe(true);
    expect((await rn.post(`/api/renewals/${p.policyId}/notice`, { noticeType: 'initial' })).status).toBe(409); // not dispositioned
    expect((await rn.post(`/api/renewals/${p.policyId}/disposition`, { disposition: 'for_renewal' })).status).toBe(200);
    expect((await rn.post(`/api/renewals/${p.policyId}/notice`, { noticeType: 'initial' })).status).toBe(409); // 99 days > 70
    // A policy expiring in 60 days: initial allowed, final not yet
    const inc2 = new Date(); inc2.setUTCFullYear(inc2.getUTCFullYear() - 1); inc2.setUTCDate(inc2.getUTCDate() + 61);
    const p2 = await issuePolicy(client.id, { inceptionDate: iso(inc2), product: 'MTR-CTPL', sumInsured: 100_000 });
    await rn.post(`/api/renewals/${p2.policyId}/disposition`, { disposition: 'for_renewal' });
    expect((await rn.post(`/api/renewals/${p2.policyId}/notice`, { noticeType: 'final' })).status).toBe(409);
    expect((await rn.post(`/api/renewals/${p2.policyId}/notice`, { noticeType: 'initial' })).status).toBe(201);
    expect((await rn.post(`/api/renewals/${p2.policyId}/notice`, { noticeType: 'initial' })).status).toBe(409);
    expect((await rn.post(`/api/renewals/${p2.policyId}/notice`, { noticeType: 'final' })).status).toBe(409); // 60 days > 45
    // A policy expiring in 30 days: final allowed after initial
    const inc3 = new Date(); inc3.setUTCFullYear(inc3.getUTCFullYear() - 1); inc3.setUTCDate(inc3.getUTCDate() + 31);
    const p3 = await issuePolicy(client.id, { inceptionDate: iso(inc3), product: 'MTR-CTPL', sumInsured: 100_000 });
    await rn.post(`/api/renewals/${p3.policyId}/disposition`, { disposition: 'for_renewal' });
    await rn.post(`/api/renewals/${p3.policyId}/notice`, { noticeType: 'initial' });
    expect((await rn.post(`/api/renewals/${p3.policyId}/notice`, { noticeType: 'final' })).status).toBe(201);
    // Renewal requires client acceptance, then follows placement → booking
    expect((await rn.post(`/api/renewals/${p3.policyId}/renew`, {})).status).toBe(409);
    expect((await rn.post(`/api/renewals/${p3.policyId}/client-acceptance`, { accepted: true })).status).toBe(200);
    const ren = await rn.post(`/api/renewals/${p3.policyId}/renew`, { sumInsured: 120_000 });
    expect(ren.status).toBe(201);
    expect(ren.body.status).toBe('placement_requested');
    expect((await rn.post(`/api/renewals/${p3.policyId}/renew`, {})).status).toBe(409);
    const stillListed = (await rn.get('/api/renewals/pipeline')).body.policies.find((x: any) => x.policy_no === p3.policyNo);
    expect(stillListed.renewal_policy_no).toBe(ren.body.policyNo);
    expect(stillListed.renewal_status).toBe('placement_requested');
    await as(NB).post(`/api/new-business/policies/${ren.body.policyId}/placement-response`, { outcome: 'placed' });
    const book = await as(NB).post(`/api/new-business/policies/${ren.body.policyId}/book`);
    await as(UW).post(`/api/approvals/${book.body.approvalId}/decide`, { decision: 'approved' });
    const oldP = await as(NB).get(`/api/new-business/policies/${p3.policyId}`);
    expect(oldP.body.policy.status).toBe('renewed');
    // NRNS: not for renewal sends the non-renewal letter
    expect((await rn.post(`/api/renewals/${p.policyId}/disposition`, { disposition: 'not_for_renewal', note: 'Loss ratio' })).status).toBe(200);
    const outbox = await as('admin').get('/api/outbox');
    expect(outbox.body.emails.some((e: any) => e.template === 'nrns-letter')).toBe(true);
  });
});
