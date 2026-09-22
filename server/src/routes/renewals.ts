import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { sendMail } from '../lib/mail.js';
import { createApproval } from '../domain/approvals.js';
import { rate } from '@brokerverse/shared';

export const renewalsRouter = Router();
renewalsRouter.use(requireModule('RN', 'NB'));

/** Renewal pipeline: in-force policies expiring within the window, with notice history and disposition. */
renewalsRouter.get('/pipeline', wrap(async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days ?? 60)));
  res.json({ policies: await query(`
    SELECT p.id, p.policy_no, p.expiry_date, p.total_amount, p.premium, p.sum_insured, p.status, cl.name AS client_name, pr.name AS product_name, i.name AS insurer_name,
      (p.expiry_date - CURRENT_DATE) AS days_to_expiry,
      (SELECT array_agg(notice_type ORDER BY id) FROM renewal_notices n WHERE n.policy_id=p.id) AS notices,
      (SELECT policy_no FROM policies r WHERE r.renewed_from_id=p.id ORDER BY r.id DESC LIMIT 1) AS renewal_policy_no,
      EXISTS (SELECT 1 FROM claims c WHERE c.policy_id=p.id AND c.status NOT IN ('closed','declined')) AS has_open_claim
    FROM policies p JOIN clients cl ON cl.id=p.client_id JOIN products pr ON pr.id=p.product_id JOIN insurers i ON i.id=p.insurer_id
    WHERE p.status IN ('in_force','expired') AND p.expiry_date <= CURRENT_DATE + $1::int AND NOT EXISTS (SELECT 1 FROM policies r WHERE r.renewed_from_id=p.id AND r.status IN ('in_force','pending_approval'))
    ORDER BY p.expiry_date`, [days]) });
}));

renewalsRouter.post('/:policyId/notice', wrap(async (req, res) => {
  const policyId = idParam(req.params.policyId);
  const { noticeType } = parse(z.object({ noticeType: z.enum(['first', 'second', 'final']) }), req.body);
  const p = await one<any>('SELECT p.*, cl.name AS client_name, cl.email AS client_email FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.id=$1', [policyId]);
  if (!p) throw notFound('Policy not found');
  const order = ['first', 'second', 'final'];
  const sent = await query<{ notice_type: string }>('SELECT notice_type FROM renewal_notices WHERE policy_id=$1', [policyId]);
  const idx = order.indexOf(noticeType);
  if (idx > 0 && !sent.some((s) => s.notice_type === order[idx - 1])) throw conflict(`Send the ${order[idx - 1]} notice before the ${noticeType} notice`);
  if (sent.some((s) => s.notice_type === noticeType)) throw conflict(`${noticeType} notice already sent`);
  const out = await tx(async (c) => {
    const noticeNo = await nextNumber(c, 'RNN', 'RNN');
    await query('INSERT INTO renewal_notices(policy_id, notice_no, notice_type, sent_by) VALUES ($1,$2,$3,$4)', [policyId, noticeNo, noticeType, req.user!.id], c);
    await sendMail(c, p.client_email, `Renewal notice (${noticeType}) – ${p.policy_no}`, `Dear ${p.client_name},\n\nYour policy ${p.policy_no} expires on ${p.expiry_date}. Please contact us to renew.\n\nBrokerVerse`, `renewal-${noticeType}`, 'policy', policyId);
    await audit(c, req.user, 'renewal.notice', 'policy', policyId, null, { noticeNo, noticeType });
    return { noticeNo };
  });
  res.status(201).json(out);
}));

/** Renew: re-rates at current product rates for the next term and raises a maker-checker request. */
renewalsRouter.post('/:policyId/renew', wrap(async (req, res) => {
  const policyId = idParam(req.params.policyId);
  const b = parse(z.object({ sumInsured: z.number().positive().optional(), note: z.string().optional() }), req.body ?? {});
  const out = await tx(async (c) => {
    const p = await one<any>('SELECT p.*, cl.name AS client_name, cl.screening_status FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.id=$1 FOR UPDATE OF p', [policyId], c);
    if (!p) throw notFound('Policy not found');
    if (!['in_force', 'expired'].includes(p.status)) throw conflict(`Policy is ${p.status}`);
    if (['hit', 'declined'].includes(p.screening_status)) throw conflict('Client is blocked by sanctions screening');
    const dup = await one("SELECT 1 FROM policies WHERE renewed_from_id=$1 AND status IN ('pending_approval','in_force')", [policyId], c);
    if (dup) throw conflict('A renewal is already in progress for this policy');
    const pr = await one<any>('SELECT * FROM products WHERE id=$1', [p.product_id], c);
    const sumInsured = b.sumInsured ?? p.sum_insured;
    const r = rate({ sumInsured, baseRate: pr.base_rate, minPremium: pr.min_premium, commissionRate: pr.commission_rate, vatRate: pr.vat_rate, dstRate: pr.dst_rate, lgtRate: pr.lgt_rate, fstRate: pr.fst_rate });
    const inception = new Date(p.expiry_date + 'T00:00:00Z'); inception.setUTCDate(inception.getUTCDate() + 1);
    const expiry = new Date(inception); expiry.setUTCFullYear(expiry.getUTCFullYear() + 1); expiry.setUTCDate(expiry.getUTCDate() - 1);
    const policyNo = await nextNumber(c, 'POL', 'POL');
    const np = await one<{ id: number }>(
      `INSERT INTO policies(policy_no, client_id, product_id, insurer_id, sum_insured, premium, vat, dst, lgt, fst, total_amount, commission, inception_date, expiry_date, renewed_from_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [policyNo, p.client_id, p.product_id, p.insurer_id, sumInsured, r.premium, r.vat, r.dst, r.lgt, r.fst, r.total, r.commission, inception.toISOString().slice(0, 10), expiry.toISOString().slice(0, 10), policyId, req.user!.id], c);
    const variance = Math.round((r.premium - p.premium) * 100) / 100;
    const approvalId = await createApproval(c, req.user!, 'policy_issue', 'policy', np!.id, `Renew ${p.policy_no} as ${policyNo} for ${p.client_name} – PHP ${r.total.toFixed(2)} (premium variance ${variance >= 0 ? '+' : ''}${variance.toFixed(2)})`, { renewedFrom: p.policy_no, variance }, b.note);
    await audit(c, req.user, 'renewal.create', 'policy', np!.id, null, { policyNo, renewedFrom: p.policy_no, variance });
    return { policyId: np!.id, policyNo, approvalId, rating: r, premiumVariance: variance };
  });
  res.status(201).json(out);
}));
