import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireApprover, requireModule } from '../lib/auth.js';
import { notFound, conflict } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { screenName, riskAssessment } from '@brokerverse/shared';

export const clientsRouter = Router();
clientsRouter.use(requireModule('SS', 'NB', 'CSF', 'EB', 'CLM', 'CLXN', 'RN'));

clientsRouter.get('/', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const status = String(req.query.status ?? '');
  res.json({ clients: await query(
    `SELECT * FROM clients WHERE ($1 = '' OR name ILIKE '%'||$1||'%' OR client_no ILIKE '%'||$1||'%') AND ($2 = '' OR screening_status = $2) ORDER BY id DESC LIMIT 500`, [q, status]) });
}));

clientsRouter.get('/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const client = await one('SELECT * FROM clients WHERE id=$1', [id]);
  if (!client) throw notFound('Client not found');
  const hits = await query('SELECT * FROM screening_results WHERE client_id=$1 ORDER BY score DESC', [id]);
  const policies = await query('SELECT id, policy_no, status, total_amount, inception_date, expiry_date FROM policies WHERE client_id=$1 ORDER BY id DESC', [id]);
  res.json({ client, hits, policies });
}));

const clientSchema = z.object({
  name: z.string().min(2), type: z.enum(['individual', 'corporate']), tin: z.string().optional(), email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(), address: z.string().optional(), country: z.string().length(2).default('PH'), pep: z.boolean().default(false),
});

const HIGH_RISK_COUNTRIES = new Set(['IR', 'KP', 'MM', 'SY']);

/** Create a client and screen the name at once (exact / fuzzy / phonetic) → risk tier → CDD level. */
clientsRouter.post('/', requireModule('SS', 'NB', 'EB', 'CSF'), wrap(async (req, res) => {
  const b = parse(clientSchema, req.body);
  const list = await query<{ name: string; list_source: string; category: string }>('SELECT name, list_source, category FROM sanctions_list');
  const hits = screenName(b.name, list.map((l) => ({ name: l.name, listSource: l.list_source, category: l.category })));
  const risk = riskAssessment({ hits, pep: b.pep, clientType: b.type, highRiskCountry: HIGH_RISK_COUNTRIES.has(b.country) });
  const out = await tx(async (c) => {
    const clientNo = await nextNumber(c, 'CLT', 'CLT');
    const row = await one<{ id: number }>(
      `INSERT INTO clients(client_no, name, type, tin, email, phone, address, country, pep, risk_score, risk_tier, cdd_level, screening_status, screened_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14) RETURNING id`,
      [clientNo, b.name, b.type, b.tin ?? null, b.email || null, b.phone ?? null, b.address ?? null, b.country, b.pep, risk.score, risk.tier, risk.cdd, risk.status, req.user!.id], c);
    for (const h of hits) await query('INSERT INTO screening_results(client_id, matched_name, list_source, method, score) VALUES ($1,$2,$3,$4,$5)', [row!.id, h.listName, h.listSource ?? null, h.method, h.score], c);
    await audit(c, req.user, 'client.create', 'client', row!.id, null, { clientNo, name: b.name, risk });
    return { id: row!.id, clientNo };
  });
  res.status(201).json({ ...out, screening: { hits, ...risk } });
}));

clientsRouter.post('/:id/rescreen', requireModule('SS'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const client = await one<any>('SELECT * FROM clients WHERE id=$1', [id]);
  if (!client) throw notFound('Client not found');
  const list = await query<{ name: string; list_source: string; category: string }>('SELECT name, list_source, category FROM sanctions_list');
  const hits = screenName(client.name, list.map((l) => ({ name: l.name, listSource: l.list_source, category: l.category })));
  const risk = riskAssessment({ hits, pep: client.pep, clientType: client.type, highRiskCountry: HIGH_RISK_COUNTRIES.has(client.country) });
  await tx(async (c) => {
    await query('DELETE FROM screening_results WHERE client_id=$1 AND decision IS NULL', [id], c);
    for (const h of hits) await query('INSERT INTO screening_results(client_id, matched_name, list_source, method, score) VALUES ($1,$2,$3,$4,$5)', [id, h.listName, h.listSource ?? null, h.method, h.score], c);
    await query('UPDATE clients SET risk_score=$2, risk_tier=$3, cdd_level=$4, screening_status=$5, screened_at=now() WHERE id=$1', [id, risk.score, risk.tier, risk.cdd, risk.status], c);
    await audit(c, req.user, 'client.rescreen', 'client', id, { status: client.screening_status }, risk);
  });
  res.json({ hits, ...risk });
}));

/** Compliance disposition of a screening hit: clear (false positive) or decline (true match). */
clientsRouter.post('/:id/disposition', requireModule('SS'), requireApprover, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { decision, note } = parse(z.object({ decision: z.enum(['clear', 'declined']), note: z.string().min(3) }), req.body);
  const client = await one<any>('SELECT * FROM clients WHERE id=$1', [id]);
  if (!client) throw notFound('Client not found');
  if (!['review', 'hit'].includes(client.screening_status)) throw conflict('Client has no open screening hit');
  await tx(async (c) => {
    await query('UPDATE screening_results SET decision=$2, decided_by=$3, decided_at=now() WHERE client_id=$1 AND decision IS NULL', [id, decision === 'clear' ? 'false_positive' : 'true_match', req.user!.id], c);
    await query('UPDATE clients SET screening_status=$2 WHERE id=$1', [id, decision], c);
    await audit(c, req.user, 'client.disposition', 'client', id, { status: client.screening_status }, { status: decision, note });
  });
  res.json({ ok: true, status: decision });
}));

clientsRouter.get('/sanctions/list', requireModule('SS'), wrap(async (_req, res) => {
  res.json({ entries: await query('SELECT * FROM sanctions_list ORDER BY name') });
}));

clientsRouter.post('/sanctions/list', requireModule('SS'), wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2), listSource: z.string().min(1), category: z.string().default('sanction') }), req.body);
  const row = await one<{ id: number }>('INSERT INTO sanctions_list(name, list_source, category) VALUES ($1,$2,$3) RETURNING id', [b.name, b.listSource, b.category]);
  res.status(201).json({ id: row!.id });
}));
