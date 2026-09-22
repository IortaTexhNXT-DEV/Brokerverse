import { describe, it, expect, afterAll } from 'vitest';
import { as, newClient, productId, insurerId, todayIso, quoteAndAccept, placePolicy, issuePolicy, NB, UW } from './helpers.js';
import { closePool } from '../src/db.js';

afterAll(closePool);

describe('New Business process: quote → proposal → acceptance → placement → e-policy → booking', () => {
  it('follows the process order and refuses shortcuts', async () => {
    const client = await newClient(NB, 'Process Order Corp');
    const nb = as(NB);
    const q = await nb.post('/api/new-business/quotations', { clientId: client.id, productId: await productId('MTR-CMP'), insurerId: await insurerId('MAL'), sumInsured: 1_000_000, inceptionDate: todayIso() });
    expect(q.status).toBe(201);
    expect(q.body.rating.total).toBe(15656.25);
    // Cannot record a decision or place before the proposal is sent
    expect((await nb.post(`/api/new-business/quotations/${q.body.id}/decision`, { decision: 'accepted' })).status).toBe(409);
    expect((await nb.post(`/api/new-business/quotations/${q.body.id}/request-placement`)).status).toBe(409);
    expect((await nb.post(`/api/new-business/quotations/${q.body.id}/send-proposal`)).status).toBe(200);
    const outbox = await as('admin').get('/api/outbox');
    expect(outbox.body.emails.some((e: any) => e.template === 'proposal' && e.subject.includes(q.body.quoteNo))).toBe(true);
    expect((await nb.post(`/api/new-business/quotations/${q.body.id}/decision`, { decision: 'declined' })).status).toBe(400);
    expect((await nb.post(`/api/new-business/quotations/${q.body.id}/decision`, { decision: 'accepted' })).status).toBe(200);

    // Placement slip goes to the insurer; booking is refused until the insurer places
    const placed = await nb.post(`/api/new-business/quotations/${q.body.id}/request-placement`);
    expect(placed.status).toBe(201);
    let det = await nb.get(`/api/new-business/policies/${placed.body.policyId}`);
    expect(det.body.policy.status).toBe('placement_requested');
    expect((await nb.post(`/api/new-business/policies/${placed.body.policyId}/book`)).status).toBe(409);

    // Insurer returns the placement; marketing handles the reason and re-submits
    expect((await nb.post(`/api/new-business/policies/${placed.body.policyId}/placement-response`, { outcome: 'returned' })).status).toBe(400);
    expect((await nb.post(`/api/new-business/policies/${placed.body.policyId}/placement-response`, { outcome: 'returned', reason: 'Missing vehicle OR/CR' })).status).toBe(200);
    det = await nb.get(`/api/new-business/policies/${placed.body.policyId}`);
    expect(det.body.policy.status).toBe('returned');
    expect(det.body.policy.return_reason).toBe('Missing vehicle OR/CR');
    expect((await nb.post(`/api/new-business/policies/${placed.body.policyId}/resubmit-placement`)).status).toBe(200);
    expect((await nb.post(`/api/new-business/policies/${placed.body.policyId}/placement-response`, { outcome: 'placed', insurerPolicyRef: 'MAL-778' })).status).toBe(200);

    // Booking under maker-checker; maker cannot approve; e-policy via SFTP for an enrolled insurer
    const book = await nb.post(`/api/new-business/policies/${placed.body.policyId}/book`, { note: 'please book' });
    expect(book.status).toBe(201);
    expect((await nb.post(`/api/approvals/${book.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(403);
    expect((await as(UW).post(`/api/approvals/${book.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(200);
    det = await nb.get(`/api/new-business/policies/${placed.body.policyId}`);
    expect(det.body.policy.status).toBe('in_force');
    expect(det.body.policy.epolicy_channel).toBe('sftp');
    expect(det.body.invoices).toHaveLength(1);
    expect(det.body.journals).toHaveLength(1);
    const quotes = await nb.get('/api/new-business/quotations?status=converted');
    expect(quotes.body.quotations.some((x: any) => x.id === q.body.id)).toBe(true);

    // E-policy exception: fallout is routed to the contact centre
    expect((await nb.post(`/api/new-business/policies/${placed.body.policyId}/epolicy-exception`)).status).toBe(200);
    det = await nb.get(`/api/new-business/policies/${placed.body.policyId}`);
    expect(det.body.policy.epolicy_channel).toBe('contact_centre');
  });

  it('non-SFTP insurers receive e-policy by email; declined proposals stop the flow', async () => {
    const client = await newClient(NB, 'Email Epolicy Inc');
    const p = await issuePolicy(client.id, { insurer: 'FPG' });
    expect(p.policy.epolicy_channel).toBe('email');
    const nb = as(NB);
    const q = await nb.post('/api/new-business/quotations', { clientId: client.id, productId: await productId('MTR-CTPL'), insurerId: await insurerId('FPG'), sumInsured: 100_000, inceptionDate: todayIso() });
    await nb.post(`/api/new-business/quotations/${q.body.id}/send-proposal`);
    expect((await nb.post(`/api/new-business/quotations/${q.body.id}/decision`, { decision: 'declined', reason: 'Price' })).status).toBe(200);
    expect((await nb.post(`/api/new-business/quotations/${q.body.id}/request-placement`)).status).toBe(409);
  });

  it('non-packaged products require a TSU request with an approved proposal', async () => {
    const client = await newClient(NB, 'Non Packaged Risk Co');
    const nb = as(NB);
    const fireCom = await productId('FIRE-COM');
    const blocked = await nb.post('/api/new-business/quotations', { clientId: client.id, productId: fireCom, insurerId: await insurerId('MAL'), sumInsured: 30_000_000, inceptionDate: todayIso() });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/TSU/);

    // TSU workflow: submit → acknowledge → QS → TL approval → RI referral → send to insurers → responses → comparative → proposal approval
    const t = await nb.post('/api/tsu', { clientId: client.id, productId: fireCom, line: 'fire', sumInsured: 30_000_000, riskDetails: 'Warehouse complex, sprinklered, Class A construction', expiringTerms: 'n/a' });
    expect(t.status).toBe(201);
    expect((await nb.post('/api/tsu', { clientId: client.id, productId: fireCom, line: 'fire', sumInsured: 1, riskDetails: 'duplicate request here' })).status).toBe(409);
    const tsu = as('admin');
    const step = (to: string, extra: Record<string, unknown> = {}) => tsu.post(`/api/tsu/${t.body.id}/transition`, { to, ...extra });
    expect((await step('qs_prepared')).status).toBe(409); // must acknowledge first
    expect((await step('acknowledged')).status).toBe(200);
    expect((await step('qs_prepared')).status).toBe(409); // slip content required
    expect((await step('qs_prepared', { quotationSlip: 'Risk: warehouse. Terms: standard fire. Rate 0.25%' })).status).toBe(200);
    expect((await nb.post(`/api/tsu/${t.body.id}/transition`, { to: 'qs_approved' })).status).toBe(409); // NB officer is not an approver
    expect((await step('qs_approved')).status).toBe(200);
    expect((await step('ri_referred')).status).toBe(200);
    const mal = await insurerId('MAL'); const fpg = await insurerId('FPG');
    expect((await step('sent_to_insurers', { insurerIds: [mal, fpg] })).status).toBe(200);
    expect((await tsu.post(`/api/tsu/${t.body.id}/responses`, { insurerId: mal, response: 'accepted', premium: 70000 })).status).toBe(409); // evidence required
    expect((await tsu.post(`/api/tsu/${t.body.id}/responses`, { insurerId: mal, response: 'accepted', premium: 70000, evidence: 'Signed slip 2026-09-20' })).status).toBe(200);
    expect((await tsu.post(`/api/tsu/${t.body.id}/responses`, { insurerId: fpg, response: 'declined', conditions: 'Outside appetite' })).status).toBe(200);
    expect((await step('comparative_ready')).status).toBe(200);
    const det = await tsu.get(`/api/tsu/${t.body.id}`);
    expect(det.body.request.insurers_accepted).toBe(1);
    expect((await step('proposal_approved', { selectedInsurerId: mal, proposalSlip: 'Recommend Malayan at PHP 70,000' })).status).toBe(200);

    const quoted = await nb.post('/api/new-business/quotations', { clientId: client.id, productId: fireCom, insurerId: mal, sumInsured: 30_000_000, inceptionDate: todayIso(), tsuRequestId: t.body.id, holdCoverDays: 30 });
    expect(quoted.status).toBe(201);
    const outbox = await as('admin').get('/api/outbox');
    expect(outbox.body.emails.some((e: any) => e.template === 'hold-cover')).toBe(true);
  });

  it('cancellation before booking withdraws the pending approval', async () => {
    const client = await newClient(NB, 'Withdrawn Corp');
    const q = await quoteAndAccept(client.id, { product: 'MTR-CTPL', sumInsured: 100_000 });
    const placed = await placePolicy(q.id);
    const book = await as(NB).post(`/api/new-business/policies/${placed.policyId}/book`);
    expect((await as(NB).post(`/api/new-business/policies/${placed.policyId}/cancel`, { reason: 'Client withdrew' })).status).toBe(200);
    expect((await as(UW).post(`/api/approvals/${book.body.approvalId}/decide`, { decision: 'approved' })).status).toBe(409);
  });
});
