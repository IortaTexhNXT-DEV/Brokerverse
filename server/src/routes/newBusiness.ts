import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound, badRequest, createApproval } from '../lib/kit.js';
import { loadPolicy, requestPlacement, dispatchEPolicy } from '../domain/policies.js';
import { withdrawPending } from '../domain/approvals.js';
import { rate } from '@brokerverse/shared';

export const newBusinessRouter = Router();
newBusinessRouter.use(requireModule('NB', 'RN'));

const policySelect = `SELECT p.*, cl.name AS client_name, cl.client_no, pr.code AS product_code, pr.name AS product_name, i.name AS insurer_name, i.sftp_enrolled
  FROM policies p JOIN clients cl ON cl.id=p.client_id JOIN products pr ON pr.id=p.product_id JOIN insurers i ON i.id=p.insurer_id`;
const quoteSelect = `SELECT q.*, cl.name AS client_name, cl.email AS client_email, pr.code AS product_code, pr.name AS product_name, pr.packaged, i.name AS insurer_name
  FROM quotations q JOIN clients cl ON cl.id=q.client_id JOIN products pr ON pr.id=q.product_id JOIN insurers i ON i.id=q.insurer_id`;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const BLOCKED_SCREENING = ['hit', 'declined'];

newBusinessRouter.get('/quotations', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  res.json({ quotations: await query(`${quoteSelect} WHERE ($1 = '' OR q.status = $1) ORDER BY q.id DESC LIMIT 500`, [status]) });
}));

const quoteSchema = z.object({
  clientId: z.number().int().positive(), productId: z.number().int().positive(), insurerId: z.number().int().positive(),
  sumInsured: z.number().positive(), inceptionDate: DATE, tsuRequestId: z.number().int().positive().optional(), holdCoverDays: z.number().int().min(0).max(60).optional(),
});

async function assertQuotable(b: z.infer<typeof quoteSchema>) {
  const client = await one<any>('SELECT * FROM clients WHERE id=$1', [b.clientId]);
  if (!client) throw notFound('Client not found');
  if (BLOCKED_SCREENING.includes(client.screening_status)) throw conflict(`Client ${client.client_no} is blocked by sanctions screening (${client.screening_status})`);
  const product = await one<any>("SELECT * FROM products WHERE id=$1 AND status='active'", [b.productId]);
  if (!product) throw notFound('Active product not found');
  const insurer = await one<any>("SELECT * FROM insurers WHERE id=$1 AND status='active'", [b.insurerId]);
  if (!insurer) throw notFound('Active insurer not found');
  if (product.max_sum_insured && b.sumInsured > product.max_sum_insured) throw conflict(`Sum insured exceeds product acceptance limit of ${product.max_sum_insured}`);
  if (!product.packaged) {
    // Non-packaged accounts are quoted by TSU: a proposal-approved TSU request must back the quotation.
    const t = b.tsuRequestId ? await one<any>('SELECT * FROM tsu_requests WHERE id=$1', [b.tsuRequestId]) : undefined;
    if (!t || t.status !== 'proposal_approved' || t.client_id !== b.clientId) throw conflict('Non-packaged product: a TSU request with an approved proposal is required');
  }
  return { client, product, insurer };
}

const termEnd = (inception: string) => { const d = new Date(`${inception}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

/** Quote: rates the risk, enforces acceptance bounds, screening gate and the TSU rule for non-packaged lines. */
newBusinessRouter.post('/quotations', wrap(async (req, res) => {
  const b = parse(quoteSchema, req.body);
  const { product } = await assertQuotable(b);
  if (Number.isNaN(new Date(`${b.inceptionDate}T00:00:00Z`).getTime())) throw badRequest('Invalid inception date');
  const r = rate({ sumInsured: b.sumInsured, baseRate: product.base_rate, minPremium: product.min_premium, commissionRate: product.commission_rate, vatRate: product.vat_rate, dstRate: product.dst_rate, lgtRate: product.lgt_rate, fstRate: product.fst_rate });
  const expiryDate = termEnd(b.inceptionDate);
  const surveyRequired = !!(product.survey_required_above && b.sumInsured > product.survey_required_above);
  const holdCover = b.holdCoverDays ? new Date(Date.now() + b.holdCoverDays * 86400000).toISOString().slice(0, 10) : null;
  const out = await tx(async (c) => {
    const quoteNo = await nextNumber(c, 'QT', 'QT');
    const row = await one<{ id: number }>(
      `INSERT INTO quotations(quote_no, client_id, product_id, insurer_id, sum_insured, premium, vat, dst, lgt, fst, total_amount, commission, inception_date, expiry_date, survey_required, created_by, tsu_request_id, hold_cover_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [quoteNo, b.clientId, b.productId, b.insurerId, b.sumInsured, r.premium, r.vat, r.dst, r.lgt, r.fst, r.total, r.commission, b.inceptionDate, expiryDate, surveyRequired, req.user!.id, b.tsuRequestId ?? null, holdCover], c);
    if (holdCover) await sendMail(c, { to: 'underwriting@insurer.local', subject: `Hold cover request ${quoteNo}`, body: `Please hold cover until ${holdCover} pending placement.`, template: 'hold-cover', refType: 'quotation', refId: row!.id });
    await audit(c, req.user, { action: 'quotation.create', entity: 'quotation', entityId: row!.id, after: { quoteNo, ...r } });
    return { id: row!.id, quoteNo };
  });
  res.status(201).json({ ...out, rating: r, surveyRequired, expiryDate });
}));

async function loadQuote(id: number) {
  const q = await one<any>(`${quoteSelect} WHERE q.id=$1`, [id]);
  if (!q) throw notFound('Quotation not found');
  return q;
}

/** Proposal goes to the client (email); acceptance or decline is recorded before placement. */
newBusinessRouter.post('/quotations/:id/send-proposal', wrap(async (req, res) => {
  const q = await loadQuote(idParam(req.params.id));
  if (q.status !== 'quoted') throw conflict(`Quotation is ${q.status}`);
  await tx(async (c) => {
    await query("UPDATE quotations SET status='proposal_sent', proposal_sent_at=now() WHERE id=$1", [q.id], c);
    await sendMail(c, { to: q.client_email, subject: `Insurance proposal ${q.quote_no}`, body: `Dear ${q.client_name},\n\nPlease find our proposal for ${q.product_name} with ${q.insurer_name}: premium PHP ${Number(q.premium).toFixed(2)}, total PHP ${Number(q.total_amount).toFixed(2)}.\n\nBrokerVerse`, template: 'proposal', refType: 'quotation', refId: q.id });
    await audit(c, req.user, { action: 'quotation.proposal', entity: 'quotation', entityId: q.id, before: { status: 'quoted' }, after: { status: 'proposal_sent' } });
  });
  res.json({ ok: true });
}));

newBusinessRouter.post('/quotations/:id/decision', wrap(async (req, res) => {
  const q = await loadQuote(idParam(req.params.id));
  const b = parse(z.object({ decision: z.enum(['accepted', 'declined']), reason: z.string().optional() }), req.body);
  if (q.status !== 'proposal_sent') throw conflict('Send the proposal before recording the client decision');
  if (b.decision === 'declined' && !b.reason) throw badRequest('A decline reason is required');
  await tx(async (c) => {
    await query('UPDATE quotations SET status=$2, accepted_at = CASE WHEN $2 = \'accepted\' THEN now() ELSE NULL END, decline_reason=$3 WHERE id=$1', [q.id, b.decision, b.reason ?? null], c);
    await audit(c, req.user, { action: `quotation.${b.decision}`, entity: 'quotation', entityId: q.id, after: b });
  });
  res.json({ ok: true, status: b.decision });
}));

/** Placement request: an accepted proposal becomes a policy awaiting the insurer (placement slip sent). */
newBusinessRouter.post('/quotations/:id/request-placement', wrap(async (req, res) => {
  const q = await loadQuote(idParam(req.params.id));
  if (q.status !== 'accepted') throw conflict('Only an accepted proposal can be placed');
  const out = await tx(async (c) => {
    const policyNo = await nextNumber(c, 'POL', 'POL');
    const p = await one<{ id: number }>(
      `INSERT INTO policies(policy_no, quotation_id, client_id, product_id, insurer_id, sum_insured, premium, vat, dst, lgt, fst, total_amount, commission, inception_date, expiry_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [policyNo, q.id, q.client_id, q.product_id, q.insurer_id, q.sum_insured, q.premium, q.vat, q.dst, q.lgt, q.fst, q.total_amount, q.commission, q.inception_date, q.expiry_date, req.user!.id], c);
    await requestPlacement(c, await loadPolicy(c, p!.id), req.user!);
    return { policyId: p!.id, policyNo };
  });
  res.status(201).json(out);
}));

newBusinessRouter.get('/policies', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  res.json({ policies: await query(`${policySelect} WHERE ($1 = '' OR p.status = $1) AND ($2 = '' OR p.policy_no ILIKE '%'||$2||'%' OR cl.name ILIKE '%'||$2||'%') ORDER BY p.id DESC LIMIT 500`, [status, q]) });
}));

newBusinessRouter.get('/policies/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const policy = await one(`${policySelect} WHERE p.id=$1`, [id]);
  if (!policy) throw notFound('Policy not found');
  const [invoices, claims, cessions, journals, endorsements] = await Promise.all([
    query('SELECT * FROM invoices WHERE policy_id=$1 ORDER BY id', [id]),
    query('SELECT id, claim_no, status, estimated_amount, paid_amount, loss_date FROM claims WHERE policy_id=$1 ORDER BY id DESC', [id]),
    query('SELECT c.*, t.code AS treaty_code, t.name AS treaty_name FROM cessions c JOIN treaties t ON t.id=c.treaty_id WHERE c.policy_id=$1', [id]),
    query("SELECT je.jv_no, je.entry_date, je.description FROM journal_entries je WHERE je.source_type IN ('policy','endorsement') AND je.source_id=$1", [String(id)]),
    query('SELECT * FROM endorsements WHERE policy_id=$1 ORDER BY id DESC', [id]),
  ]);
  res.json({ policy, invoices, claims, cessions, journals, endorsements });
}));

/** Insurer placement response: placed (e-policy received) or returned with a reason for marketing to handle. */
newBusinessRouter.post('/policies/:id/placement-response', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ outcome: z.enum(['placed', 'returned']), insurerPolicyRef: z.string().optional(), reason: z.string().optional() }), req.body);
  if (b.outcome === 'returned' && !b.reason) throw badRequest('Return reason is required');
  await tx(async (c) => {
    const p = await loadPolicy(c, id, true);
    if (p.status !== 'placement_requested') throw conflict(`Policy is ${p.status}; no placement is pending`);
    if (b.outcome === 'placed') await query("UPDATE policies SET status='placed', placed_at=now(), insurer_policy_ref=$2 WHERE id=$1", [id, b.insurerPolicyRef ?? null], c);
    else await query("UPDATE policies SET status='returned', return_reason=$2 WHERE id=$1", [id, b.reason], c);
    await audit(c, req.user, { action: `policy.placement.${b.outcome}`, entity: 'policy', entityId: id, after: b });
  });
  res.json({ ok: true, status: b.outcome });
}));

/** Marketing handles the return reason and re-submits the placement. */
newBusinessRouter.post('/policies/:id/resubmit-placement', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  await tx(async (c) => {
    const p = await loadPolicy(c, id, true);
    if (p.status !== 'returned') throw conflict('Only a returned placement can be re-submitted');
    await requestPlacement(c, p, req.user!);
  });
  res.json({ ok: true });
}));

/** Booking: a placed policy is booked/invoiced under maker-checker. */
newBusinessRouter.post('/policies/:id/book', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { note } = parse(z.object({ note: z.string().optional() }), req.body ?? {});
  const out = await tx(async (c) => {
    const p = await loadPolicy(c, id, true);
    if (p.status !== 'placed') throw conflict(`Policy is ${p.status}; only a placed policy can be booked`);
    await query("UPDATE policies SET status='pending_approval' WHERE id=$1", [id], c);
    const approvalId = await createApproval(c, req.user!, { requestType: 'policy_issue', entity: 'policy', entityId: id, summary: `Book ${p.policy_no} for ${p.client_name} – PHP ${Number(p.total_amount).toFixed(2)}`, note });
    await audit(c, req.user, { action: 'policy.book.request', entity: 'policy', entityId: id, after: { approvalId } });
    return { approvalId };
  });
  res.status(201).json(out);
}));

/** E-policy exception handling: a failed send falls out to the contact centre. */
newBusinessRouter.post('/policies/:id/epolicy-exception', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  await tx(async (c) => {
    const p = await loadPolicy(c, id, true);
    if (p.status !== 'in_force') throw conflict('E-policy can only be re-sent for an in-force policy');
    const inv = await one<{ invoice_no: string }>('SELECT invoice_no FROM invoices WHERE policy_id=$1 ORDER BY id LIMIT 1', [id], c);
    await dispatchEPolicy(c, p, inv?.invoice_no ?? '', req.user!, true);
    await audit(c, req.user, { action: 'policy.epolicy.exception', entity: 'policy', entityId: id, after: { channel: 'contact_centre' } });
  });
  res.json({ ok: true });
}));

newBusinessRouter.post('/policies/:id/cancel', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { reason } = parse(z.object({ reason: z.string().min(3) }), req.body);
  await tx(async (c) => {
    const p = await loadPolicy(c, id, true);
    if (!['placement_requested', 'returned', 'placed', 'pending_approval'].includes(p.status)) throw conflict(`Policy is ${p.status}; use an endorsement to cancel an in-force policy`);
    await query("UPDATE policies SET status='cancelled' WHERE id=$1", [id], c);
    await withdrawPending(c, 'policy', id, 'Cancelled by maker');
    await audit(c, req.user, { action: 'policy.cancel', entity: 'policy', entityId: id, before: { status: p.status }, after: { status: 'cancelled', reason } });
  });
  res.json({ ok: true });
}));
