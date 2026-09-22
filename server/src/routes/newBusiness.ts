import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound, badRequest } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { createApproval } from '../domain/approvals.js';
import { rate } from '@brokerverse/shared';

export const newBusinessRouter = Router();
newBusinessRouter.use(requireModule('NB', 'RN'));

const policySelect = `SELECT p.*, cl.name AS client_name, cl.client_no, pr.code AS product_code, pr.name AS product_name, i.name AS insurer_name
  FROM policies p JOIN clients cl ON cl.id=p.client_id JOIN products pr ON pr.id=p.product_id JOIN insurers i ON i.id=p.insurer_id`;

newBusinessRouter.get('/quotations', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  res.json({ quotations: await query(
    `SELECT q.*, cl.name AS client_name, pr.code AS product_code, pr.name AS product_name, i.name AS insurer_name
     FROM quotations q JOIN clients cl ON cl.id=q.client_id JOIN products pr ON pr.id=q.product_id JOIN insurers i ON i.id=q.insurer_id
     WHERE ($1 = '' OR q.status = $1) ORDER BY q.id DESC LIMIT 500`, [status]) });
}));

const quoteSchema = z.object({
  clientId: z.number().int().positive(), productId: z.number().int().positive(), insurerId: z.number().int().positive(),
  sumInsured: z.number().positive(), inceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Quote: rates the risk, enforces acceptance bounds and the screening gate. */
newBusinessRouter.post('/quotations', wrap(async (req, res) => {
  const b = parse(quoteSchema, req.body);
  const client = await one<any>('SELECT * FROM clients WHERE id=$1', [b.clientId]);
  if (!client) throw notFound('Client not found');
  if (client.screening_status === 'hit' || client.screening_status === 'declined') throw conflict(`Client ${client.client_no} is blocked by sanctions screening (${client.screening_status})`);
  const p = await one<any>("SELECT * FROM products WHERE id=$1 AND status='active'", [b.productId]);
  if (!p) throw notFound('Active product not found');
  const ins = await one<any>("SELECT * FROM insurers WHERE id=$1 AND status='active'", [b.insurerId]);
  if (!ins) throw notFound('Active insurer not found');
  if (p.max_sum_insured && b.sumInsured > p.max_sum_insured) throw conflict(`Sum insured exceeds product acceptance limit of ${p.max_sum_insured}`);
  const r = rate({ sumInsured: b.sumInsured, baseRate: p.base_rate, minPremium: p.min_premium, commissionRate: p.commission_rate, vatRate: p.vat_rate, dstRate: p.dst_rate, lgtRate: p.lgt_rate, fstRate: p.fst_rate });
  const inception = new Date(b.inceptionDate + 'T00:00:00Z');
  if (Number.isNaN(inception.getTime())) throw badRequest('Invalid inception date');
  const expiry = new Date(inception); expiry.setUTCFullYear(expiry.getUTCFullYear() + 1); expiry.setUTCDate(expiry.getUTCDate() - 1);
  const surveyRequired = !!(p.survey_required_above && b.sumInsured > p.survey_required_above);
  const out = await tx(async (c) => {
    const quoteNo = await nextNumber(c, 'QT', 'QT');
    const row = await one<{ id: number }>(
      `INSERT INTO quotations(quote_no, client_id, product_id, insurer_id, sum_insured, premium, vat, dst, lgt, fst, total_amount, commission, inception_date, expiry_date, survey_required, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [quoteNo, b.clientId, b.productId, b.insurerId, b.sumInsured, r.premium, r.vat, r.dst, r.lgt, r.fst, r.total, r.commission, b.inceptionDate, expiry.toISOString().slice(0, 10), surveyRequired, req.user!.id], c);
    await audit(c, req.user, 'quotation.create', 'quotation', row!.id, null, { quoteNo, ...r });
    return { id: row!.id, quoteNo };
  });
  res.status(201).json({ ...out, rating: r, surveyRequired, expiryDate: expiry.toISOString().slice(0, 10) });
}));

/** Bind: converts a quotation to a policy pending checker approval (maker-checker). */
newBusinessRouter.post('/quotations/:id/issue', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { note } = parse(z.object({ note: z.string().optional() }), req.body ?? {});
  const q = await one<any>('SELECT q.*, cl.name AS client_name FROM quotations q JOIN clients cl ON cl.id=q.client_id WHERE q.id=$1', [id]);
  if (!q) throw notFound('Quotation not found');
  if (q.status !== 'quoted') throw conflict(`Quotation is ${q.status}`);
  const out = await tx(async (c) => {
    const policyNo = await nextNumber(c, 'POL', 'POL');
    const p = await one<{ id: number }>(
      `INSERT INTO policies(policy_no, quotation_id, client_id, product_id, insurer_id, sum_insured, premium, vat, dst, lgt, fst, total_amount, commission, inception_date, expiry_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [policyNo, q.id, q.client_id, q.product_id, q.insurer_id, q.sum_insured, q.premium, q.vat, q.dst, q.lgt, q.fst, q.total_amount, q.commission, q.inception_date, q.expiry_date, req.user!.id], c);
    const approvalId = await createApproval(c, req.user!, 'policy_issue', 'policy', p!.id, `Issue ${policyNo} for ${q.client_name} – PHP ${Number(q.total_amount).toFixed(2)}`, { quoteNo: q.quote_no }, note);
    await audit(c, req.user, 'policy.bind', 'policy', p!.id, null, { policyNo, quoteNo: q.quote_no });
    return { policyId: p!.id, policyNo, approvalId };
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
  const invoices = await query('SELECT * FROM invoices WHERE policy_id=$1 ORDER BY id', [id]);
  const claims = await query('SELECT id, claim_no, status, estimated_amount, paid_amount, loss_date FROM claims WHERE policy_id=$1 ORDER BY id DESC', [id]);
  const cessions = await query('SELECT c.*, t.code AS treaty_code, t.name AS treaty_name FROM cessions c JOIN treaties t ON t.id=c.treaty_id WHERE c.policy_id=$1', [id]);
  const journals = await query("SELECT je.jv_no, je.entry_date, je.description FROM journal_entries je WHERE je.source_type='policy' AND je.source_id=$1", [String(id)]);
  res.json({ policy, invoices, claims, cessions, journals });
}));

newBusinessRouter.post('/policies/:id/cancel', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { reason } = parse(z.object({ reason: z.string().min(3) }), req.body);
  const p = await one<any>('SELECT * FROM policies WHERE id=$1', [id]);
  if (!p) throw notFound('Policy not found');
  if (!['in_force', 'pending_approval'].includes(p.status)) throw conflict(`Policy is ${p.status}`);
  await tx(async (c) => {
    await query("UPDATE policies SET status='cancelled' WHERE id=$1", [id], c);
    await query("UPDATE approvals SET status='rejected', checker_note='Cancelled by maker', decided_at=now() WHERE entity='policy' AND entity_id=$1 AND status='pending'", [id], c);
    await audit(c, req.user, 'policy.cancel', 'policy', id, { status: p.status }, { status: 'cancelled', reason });
  });
  res.json({ ok: true });
}));
