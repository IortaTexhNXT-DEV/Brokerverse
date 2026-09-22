import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';

export const reinsuranceRouter = Router();
reinsuranceRouter.use(requireModule('RI'));

const RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'NR'];
const MIN_RATING = 'BBB';
const ratingOk = (r: string) => RATING_ORDER.indexOf(r.toUpperCase()) !== -1 && RATING_ORDER.indexOf(r.toUpperCase()) <= RATING_ORDER.indexOf(MIN_RATING);

reinsuranceRouter.get('/treaties', wrap(async (_req, res) => {
  res.json({ treaties: await query(`SELECT t.*, COALESCE(SUM(c.ceded_sum_insured),0) AS utilised, COUNT(c.id)::int AS cessions FROM treaties t LEFT JOIN cessions c ON c.treaty_id=t.id GROUP BY t.id ORDER BY t.code`) });
}));

reinsuranceRouter.post('/treaties', wrap(async (req, res) => {
  const b = parse(z.object({
    code: z.string().min(2).max(12), name: z.string().min(2), reinsurer: z.string().min(2), reinsurerRating: z.string().default('A'),
    type: z.enum(['quota_share', 'surplus', 'xol', 'facultative']), cessionRate: z.number().min(0).max(1), capacity: z.number().positive(),
    inceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }), req.body);
  if (!ratingOk(b.reinsurerRating)) throw conflict(`Security rating gate: reinsurer must be rated ${MIN_RATING} or better`);
  if (await one('SELECT 1 FROM treaties WHERE code=$1', [b.code])) throw conflict('Treaty code already exists');
  const r = await tx(async (c) => {
    const row = await one<{ id: number }>('INSERT INTO treaties(code, name, reinsurer, reinsurer_rating, type, cession_rate, capacity, inception_date, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [b.code, b.name, b.reinsurer, b.reinsurerRating.toUpperCase(), b.type, b.cessionRate, b.capacity, b.inceptionDate, b.expiryDate], c);
    await audit(c, req.user, 'treaty.create', 'treaty', row!.id, null, b);
    return row!;
  });
  res.status(201).json({ id: r.id });
}));

reinsuranceRouter.get('/cessions', wrap(async (_req, res) => {
  res.json({ cessions: await query('SELECT c.*, t.code AS treaty_code, t.reinsurer, p.policy_no, cl.name AS client_name FROM cessions c JOIN treaties t ON t.id=c.treaty_id JOIN policies p ON p.id=c.policy_id JOIN clients cl ON cl.id=p.client_id ORDER BY c.id DESC LIMIT 300') });
}));

/** Cede a policy to a treaty: rating gate, capacity check, in-force check. */
reinsuranceRouter.post('/cessions', wrap(async (req, res) => {
  const b = parse(z.object({ policyNo: z.string().min(3), treatyId: z.number().int().positive() }), req.body);
  const out = await tx(async (c) => {
    const p = await one<any>('SELECT * FROM policies WHERE policy_no=$1', [b.policyNo.trim().toUpperCase()], c);
    if (!p) throw notFound('Policy not found');
    if (p.status !== 'in_force') throw conflict(`Policy is ${p.status}`);
    const t = await one<any>('SELECT t.*, COALESCE((SELECT SUM(ceded_sum_insured) FROM cessions WHERE treaty_id=t.id),0) AS utilised FROM treaties t WHERE t.id=$1 FOR UPDATE', [b.treatyId], c);
    if (!t) throw notFound('Treaty not found');
    if (!ratingOk(t.reinsurer_rating)) throw conflict('Security rating gate: reinsurer rating below threshold');
    if (p.inception_date < t.inception_date || p.inception_date > t.expiry_date) throw conflict('Policy inception is outside the treaty period');
    const cededSI = Math.round(p.sum_insured * t.cession_rate * 100) / 100;
    const cededPrem = Math.round(p.premium * t.cession_rate * 100) / 100;
    if (t.utilised + cededSI > t.capacity) throw conflict(`Treaty capacity exceeded: ${Number(t.utilised).toFixed(2)} used of ${Number(t.capacity).toFixed(2)}`);
    if (await one('SELECT 1 FROM cessions WHERE policy_id=$1 AND treaty_id=$2', [p.id, t.id], c)) throw conflict('Policy already ceded to this treaty');
    const r = await one<{ id: number }>('INSERT INTO cessions(policy_id, treaty_id, ceded_sum_insured, ceded_premium, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [p.id, t.id, cededSI, cededPrem, req.user!.id], c);
    await audit(c, req.user, 'cession.create', 'cession', r!.id, null, { policyNo: p.policy_no, treaty: t.code, cededSI, cededPrem });
    return { id: r!.id, cededSumInsured: cededSI, cededPremium: cededPrem };
  });
  res.status(201).json(out);
}));
