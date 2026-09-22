import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound } from '../lib/kit.js';
import { loadPolicy, requestPlacement } from '../domain/policies.js';
import { rate } from '@brokerverse/shared';

export const renewalsRouter = Router();
renewalsRouter.use(requireModule('RN', 'NB'));

/** Renewal Master Expiry List timings from the process: extract at −140 days, initial notice at −70, final at −45. */
export const RMEL_WINDOW_DAYS = 140;
export const INITIAL_NOTICE_DAYS = 70;
export const FINAL_NOTICE_DAYS = 45;

/** RMEL pipeline: in-force policies inside the extraction window with disposition, notices and renewal status. */
renewalsRouter.get('/pipeline', wrap(async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days ?? RMEL_WINDOW_DAYS)));
  res.json({ policies: await query(`
    SELECT p.id, p.policy_no, p.expiry_date, p.total_amount, p.premium, p.sum_insured, p.status, cl.name AS client_name, pr.name AS product_name, i.name AS insurer_name,
      (p.expiry_date - CURRENT_DATE) AS days_to_expiry,
      (SELECT array_agg(notice_type ORDER BY id) FROM renewal_notices n WHERE n.policy_id=p.id) AS notices,
      d.disposition, d.client_accepted, d.note AS disposition_note,
      (SELECT policy_no FROM policies r WHERE r.renewed_from_id=p.id ORDER BY r.id DESC LIMIT 1) AS renewal_policy_no,
      (SELECT status FROM policies r WHERE r.renewed_from_id=p.id ORDER BY r.id DESC LIMIT 1) AS renewal_status,
      EXISTS (SELECT 1 FROM claims c WHERE c.policy_id=p.id AND c.status NOT IN ('closed','declined')) AS has_open_claim
    FROM policies p JOIN clients cl ON cl.id=p.client_id JOIN products pr ON pr.id=p.product_id JOIN insurers i ON i.id=p.insurer_id
    LEFT JOIN renewal_dispositions d ON d.policy_id=p.id
    WHERE p.status IN ('in_force','expired') AND p.expiry_date <= CURRENT_DATE + $1::int
    ORDER BY p.expiry_date`, [days]), window: days });
}));

/** Sanitation: the handler dispositions each account (for renewal, not for renewal/NRNS, client declined, remarket). */
renewalsRouter.post('/:policyId/disposition', wrap(async (req, res) => {
  const policyId = idParam(req.params.policyId);
  const b = parse(z.object({ disposition: z.enum(['for_renewal', 'not_for_renewal', 'client_declined', 'remarket']), note: z.string().optional() }), req.body);
  if (!(await one('SELECT 1 FROM policies WHERE id=$1', [policyId]))) throw notFound('Policy not found');
  await tx(async (c) => {
    await query(`INSERT INTO renewal_dispositions(policy_id, disposition, note, decided_by) VALUES ($1,$2,$3,$4)
      ON CONFLICT (policy_id) DO UPDATE SET disposition=EXCLUDED.disposition, note=EXCLUDED.note, decided_by=EXCLUDED.decided_by, decided_at=now()`, [policyId, b.disposition, b.note ?? null, req.user!.id], c);
    if (b.disposition === 'not_for_renewal') {
      const p = await loadPolicy(c, policyId);
      await sendMail(c, { to: p.client_email, subject: `Non-renewal notice – ${p.policy_no}`, body: `Dear ${p.client_name},\n\nPolicy ${p.policy_no} will not be renewed on expiry ${p.expiry_date}.`, template: 'nrns-letter', refType: 'policy', refId: policyId });
    }
    await audit(c, req.user, { action: 'renewal.disposition', entity: 'policy', entityId: policyId, after: b });
  });
  res.json({ ok: true });
}));

async function noticeAllowed(policyId: number, noticeType: string, daysToExpiry: number) {
  const sent = (await query<{ notice_type: string }>('SELECT notice_type FROM renewal_notices WHERE policy_id=$1', [policyId])).map((s) => s.notice_type);
  if (noticeType !== 'reminder' && sent.includes(noticeType)) throw conflict(`${noticeType} notice already sent`);
  if (noticeType === 'initial' && daysToExpiry > INITIAL_NOTICE_DAYS) throw conflict(`Initial renewal advice is sent at ${INITIAL_NOTICE_DAYS} days before expiry (${daysToExpiry} days remain)`);
  if (noticeType === 'final') {
    if (!sent.includes('initial')) throw conflict('Send the initial notice before the final notice');
    if (daysToExpiry > FINAL_NOTICE_DAYS) throw conflict(`Final notice is sent at ${FINAL_NOTICE_DAYS} days before expiry (${daysToExpiry} days remain)`);
  }
}

/** Renewal advice (RA) letters: initial at −70 days, final at −45 days; reminders any time. */
renewalsRouter.post('/:policyId/notice', wrap(async (req, res) => {
  const policyId = idParam(req.params.policyId);
  const { noticeType } = parse(z.object({ noticeType: z.enum(['initial', 'final', 'reminder']) }), req.body);
  const p = await one<any>('SELECT p.*, cl.name AS client_name, cl.email AS client_email, (p.expiry_date - CURRENT_DATE) AS days_to_expiry FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.id=$1', [policyId]);
  if (!p) throw notFound('Policy not found');
  const disp = await one<any>('SELECT * FROM renewal_dispositions WHERE policy_id=$1', [policyId]);
  if (!disp || !['for_renewal', 'remarket'].includes(disp.disposition)) throw conflict('Disposition the account for renewal before sending advice');
  await noticeAllowed(policyId, noticeType, p.days_to_expiry);
  const out = await tx(async (c) => {
    const noticeNo = await nextNumber(c, 'RNN', 'RNN');
    await query('INSERT INTO renewal_notices(policy_id, notice_no, notice_type, sent_by) VALUES ($1,$2,$3,$4)', [policyId, noticeNo, noticeType, req.user!.id], c);
    await sendMail(c, { to: p.client_email, subject: `Renewal advice (${noticeType}) – ${p.policy_no}`, body: `Dear ${p.client_name},\n\nYour policy ${p.policy_no} expires on ${p.expiry_date}. Please contact us to renew.\n\nBrokerVerse`, template: `renewal-${noticeType}`, refType: 'policy', refId: policyId });
    await audit(c, req.user, { action: 'renewal.notice', entity: 'policy', entityId: policyId, after: { noticeNo, noticeType } });
    return { noticeNo };
  });
  res.status(201).json(out);
}));

/** Client acceptance of the renewal advice. */
renewalsRouter.post('/:policyId/client-acceptance', wrap(async (req, res) => {
  const policyId = idParam(req.params.policyId);
  const { accepted } = parse(z.object({ accepted: z.boolean() }), req.body);
  const r = await query("UPDATE renewal_dispositions SET client_accepted=$2, disposition = CASE WHEN $2 THEN disposition ELSE 'client_declined' END WHERE policy_id=$1 AND disposition IN ('for_renewal','remarket') RETURNING policy_id", [policyId, accepted]);
  if (!r.length) throw conflict('Account is not dispositioned for renewal');
  res.json({ ok: true });
}));

/** Renewal placement: re-rated at current rates; the new term follows the placement → booking lifecycle. */
renewalsRouter.post('/:policyId/renew', wrap(async (req, res) => {
  const policyId = idParam(req.params.policyId);
  const b = parse(z.object({ sumInsured: z.number().positive().optional(), note: z.string().optional() }), req.body ?? {});
  const out = await tx(async (c) => {
    const p = await one<any>('SELECT p.*, cl.name AS client_name, cl.screening_status FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.id=$1 FOR UPDATE OF p', [policyId], c);
    if (!p) throw notFound('Policy not found');
    if (!['in_force', 'expired'].includes(p.status)) throw conflict(`Policy is ${p.status}`);
    if (['hit', 'declined'].includes(p.screening_status)) throw conflict('Client is blocked by sanctions screening');
    const disp = await one<any>('SELECT * FROM renewal_dispositions WHERE policy_id=$1', [policyId], c);
    if (!disp || !['for_renewal', 'remarket'].includes(disp.disposition) || !disp.client_accepted) throw conflict('Renewal requires a for-renewal disposition and client acceptance');
    if (await one("SELECT 1 FROM policies WHERE renewed_from_id=$1 AND status NOT IN ('cancelled','rejected')", [policyId], c)) throw conflict('A renewal is already in progress for this policy');
    const pr = await one<any>('SELECT * FROM products WHERE id=$1', [p.product_id], c);
    const sumInsured = b.sumInsured ?? p.sum_insured;
    const r = rate({ sumInsured, baseRate: pr.base_rate, minPremium: pr.min_premium, commissionRate: pr.commission_rate, vatRate: pr.vat_rate, dstRate: pr.dst_rate, lgtRate: pr.lgt_rate, fstRate: pr.fst_rate });
    const inception = new Date(`${p.expiry_date}T00:00:00Z`); inception.setUTCDate(inception.getUTCDate() + 1);
    const expiry = new Date(inception); expiry.setUTCFullYear(expiry.getUTCFullYear() + 1); expiry.setUTCDate(expiry.getUTCDate() - 1);
    const policyNo = await nextNumber(c, 'POL', 'POL');
    const np = await one<{ id: number }>(
      `INSERT INTO policies(policy_no, client_id, product_id, insurer_id, sum_insured, premium, vat, dst, lgt, fst, total_amount, commission, inception_date, expiry_date, renewed_from_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [policyNo, p.client_id, p.product_id, p.insurer_id, sumInsured, r.premium, r.vat, r.dst, r.lgt, r.fst, r.total, r.commission, inception.toISOString().slice(0, 10), expiry.toISOString().slice(0, 10), policyId, req.user!.id], c);
    await requestPlacement(c, await loadPolicy(c, np!.id), req.user!);
    const variance = Math.round((r.premium - p.premium) * 100) / 100;
    await audit(c, req.user, { action: 'renewal.create', entity: 'policy', entityId: np!.id, after: { policyNo, renewedFrom: p.policy_no, variance, note: b.note } });
    return { policyId: np!.id, policyNo, rating: r, premiumVariance: variance, status: 'placement_requested' };
  });
  res.status(201).json(out);
}));
