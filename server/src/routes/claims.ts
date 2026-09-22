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

export const claimsRouter = Router();
claimsRouter.use(requireModule('CLM', 'RPT', 'CSF'));

const claimSelect = `SELECT c.*, cl.name AS client_name, p.policy_no, p.expiry_date, pr.name AS product_name, (CURRENT_DATE - c.reported_date) AS age_days
  FROM claims c JOIN clients cl ON cl.id=c.client_id JOIN policies p ON p.id=c.policy_id JOIN products pr ON pr.id=p.product_id`;

claimsRouter.get('/', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  const q = String(req.query.q ?? '').trim();
  res.json({ claims: await query(`${claimSelect} WHERE ($1 = '' OR c.status=$1) AND ($2 = '' OR c.claim_no ILIKE '%'||$2||'%' OR cl.name ILIKE '%'||$2||'%' OR p.policy_no ILIKE '%'||$2||'%') ORDER BY c.id DESC LIMIT 500`, [status, q]) });
}));

claimsRouter.get('/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const claim = await one(`${claimSelect} WHERE c.id=$1`, [id]);
  if (!claim) throw notFound('Claim not found');
  const events = await query('SELECT e.*, u.full_name AS user_name FROM claim_events e LEFT JOIN users u ON u.id=e.user_id WHERE claim_id=$1 ORDER BY e.id', [id]);
  res.json({ claim, events });
}));

/** Claims Acceptance Control: a claim can only be registered on an in-force policy whose premium is fully paid (reads Collections). */
claimsRouter.post('/', requireModule('CLM'), wrap(async (req, res) => {
  const b = parse(z.object({ policyNo: z.string().min(3), lossDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().min(5), estimatedAmount: z.number().min(0) }), req.body);
  const p = await one<any>('SELECT p.*, cl.name AS client_name, cl.email AS client_email FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.policy_no=$1', [b.policyNo.trim().toUpperCase()]);
  if (!p) throw notFound('Policy not found');
  if (!['in_force', 'renewed', 'expired'].includes(p.status)) throw conflict(`Policy ${p.policy_no} is ${p.status}`);
  if (b.lossDate < p.inception_date || b.lossDate > p.expiry_date) throw conflict(`Loss date is outside the policy period ${p.inception_date} to ${p.expiry_date}`);
  const outstanding = await one<{ balance: number }>("SELECT COALESCE(SUM(amount - paid_amount),0) AS balance FROM invoices WHERE policy_id=$1 AND status <> 'paid'", [p.id]);
  if ((outstanding?.balance ?? 0) > 0) throw conflict(`Claims Acceptance Control: unpaid premium of PHP ${Number(outstanding!.balance).toFixed(2)} on ${p.policy_no}`, { code: 'CAC_UNPAID_PREMIUM', balance: outstanding!.balance });
  if (b.estimatedAmount > p.sum_insured) throw conflict('Estimated amount exceeds sum insured');
  const out = await tx(async (c) => {
    const claimNo = await nextNumber(c, 'CLM', 'CLM');
    const r = await one<{ id: number }>('INSERT INTO claims(claim_no, policy_id, client_id, loss_date, description, estimated_amount, reserve_amount, created_by) VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING id',
      [claimNo, p.id, p.client_id, b.lossDate, b.description, b.estimatedAmount, req.user!.id], c);
    await query('INSERT INTO claim_events(claim_id, user_id, event, note) VALUES ($1,$2,$3,$4)', [r!.id, req.user!.id, 'registered', `Estimated PHP ${b.estimatedAmount.toFixed(2)}`], c);
    await sendMail(c, p.client_email, `Preliminary Loss Advice ${claimNo}`, `Dear ${p.client_name},\n\nWe have registered claim ${claimNo} under policy ${p.policy_no} for loss on ${b.lossDate}. Our claims team will be in touch.\n\nBrokerVerse Claims`, 'preliminary-loss-advice', 'claim', r!.id);
    await audit(c, req.user, 'claim.register', 'claim', r!.id, null, { claimNo, policyNo: p.policy_no, estimatedAmount: b.estimatedAmount });
    return { id: r!.id, claimNo };
  });
  res.status(201).json(out);
}));

const transitions: Record<string, string[]> = {
  registered: ['under_review', 'declined'],
  under_review: ['settlement_requested', 'declined'],
  approved: ['settled'],
  settled: ['closed'],
  declined: ['closed'],
};

claimsRouter.post('/:id/transition', requireModule('CLM'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ event: z.enum(['under_review', 'settlement_requested', 'settled', 'declined', 'closed']), note: z.string().optional(), amount: z.number().min(0).optional() }), req.body);
  const out = await tx(async (c) => {
    const cl = await one<any>(`${claimSelect} WHERE c.id=$1 FOR UPDATE OF c`, [id], c);
    if (!cl) throw notFound('Claim not found');
    if (!transitions[cl.status]?.includes(b.event)) throw conflict(`Cannot ${b.event} a claim that is ${cl.status}`);
    let newStatus = b.event as string;
    let approvalId: number | undefined;
    if (b.event === 'settlement_requested') {
      const amt = b.amount ?? cl.reserve_amount;
      if (amt > cl.sum_insured) throw conflict('Settlement exceeds sum insured');
      await query('UPDATE claims SET reserve_amount=$2 WHERE id=$1', [id, amt], c);
      approvalId = await createApproval(c, req.user!, 'claim_settlement', 'claim', id, `Settle ${cl.claim_no} for ${cl.client_name} – PHP ${Number(amt).toFixed(2)}`, { amount: amt }, b.note);
      newStatus = 'under_review';
    } else if (b.event === 'settled') {
      await query('UPDATE claims SET paid_amount=reserve_amount WHERE id=$1', [id], c);
    }
    await query('UPDATE claims SET status=$2, updated_at=now() WHERE id=$1', [id, newStatus], c);
    await query('INSERT INTO claim_events(claim_id, user_id, event, note) VALUES ($1,$2,$3,$4)', [id, req.user!.id, b.event, b.note ?? null], c);
    await audit(c, req.user, `claim.${b.event}`, 'claim', id, { status: cl.status }, { status: newStatus, note: b.note });
    return { ok: true, status: newStatus, approvalId };
  });
  res.json(out);
}));
