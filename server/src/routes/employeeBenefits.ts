import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';

export const ebRouter = Router();
ebRouter.use(requireModule('EB'));

const schemeSelect = `SELECT s.*, cl.name AS client_name, i.name AS insurer_name,
  (SELECT COUNT(*)::int FROM eb_members m WHERE m.scheme_id=s.id AND m.status='active') AS active_members,
  (SELECT COALESCE(SUM(1 + m.dependents),0)::int FROM eb_members m WHERE m.scheme_id=s.id AND m.status='active') AS covered_lives
  FROM eb_schemes s JOIN clients cl ON cl.id=s.client_id JOIN insurers i ON i.id=s.insurer_id`;

ebRouter.get('/schemes', wrap(async (_req, res) => {
  const schemes = await query<any>(`${schemeSelect} ORDER BY s.id DESC`);
  for (const s of schemes) s.annual_premium = Math.round(s.per_member_premium * s.covered_lives * 100) / 100;
  res.json({ schemes });
}));

ebRouter.post('/schemes', wrap(async (req, res) => {
  const b = parse(z.object({ clientId: z.number().int().positive(), insurerId: z.number().int().positive(), planName: z.string().min(2), perMemberPremium: z.number().positive(), inceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
  const client = await one<any>('SELECT * FROM clients WHERE id=$1', [b.clientId]);
  if (!client) throw notFound('Client not found');
  if (client.type !== 'corporate') throw conflict('Employee benefits schemes require a corporate client');
  if (['hit', 'declined'].includes(client.screening_status)) throw conflict('Client is blocked by sanctions screening');
  const inception = new Date(b.inceptionDate + 'T00:00:00Z'); const expiry = new Date(inception); expiry.setUTCFullYear(expiry.getUTCFullYear() + 1); expiry.setUTCDate(expiry.getUTCDate() - 1);
  const out = await tx(async (c) => {
    const schemeNo = await nextNumber(c, 'EB', 'EB');
    const r = await one<{ id: number }>('INSERT INTO eb_schemes(scheme_no, client_id, insurer_id, plan_name, per_member_premium, inception_date, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [schemeNo, b.clientId, b.insurerId, b.planName, b.perMemberPremium, b.inceptionDate, expiry.toISOString().slice(0, 10)], c);
    await audit(c, req.user, 'eb.scheme.create', 'eb_scheme', r!.id, null, { schemeNo, ...b });
    return { id: r!.id, schemeNo };
  });
  res.status(201).json(out);
}));

ebRouter.get('/schemes/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const scheme = await one<any>(`${schemeSelect} WHERE s.id=$1`, [id]);
  if (!scheme) throw notFound('Scheme not found');
  scheme.annual_premium = Math.round(scheme.per_member_premium * scheme.covered_lives * 100) / 100;
  res.json({ scheme, members: await query('SELECT * FROM eb_members WHERE scheme_id=$1 ORDER BY member_no', [id]) });
}));

/** Census upload (batch of members). Member movement is pro-rated in the premium computation. */
ebRouter.post('/schemes/:id/members', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ members: z.array(z.object({ memberNo: z.string().min(1), name: z.string().min(2), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dependents: z.number().int().min(0).default(0) })).min(1) }), req.body);
  const scheme = await one('SELECT * FROM eb_schemes WHERE id=$1', [id]);
  if (!scheme) throw notFound('Scheme not found');
  const out = await tx(async (c) => {
    let added = 0, updated = 0;
    for (const m of b.members) {
      const r = await one<{ inserted: boolean }>(
        `INSERT INTO eb_members(scheme_id, member_no, name, birth_date, dependents) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (scheme_id, member_no) DO UPDATE SET name=EXCLUDED.name, birth_date=EXCLUDED.birth_date, dependents=EXCLUDED.dependents, status='active'
         RETURNING (xmax = 0) AS inserted`, [id, m.memberNo, m.name, m.birthDate ?? null, m.dependents], c);
      if (r!.inserted) added++; else updated++;
    }
    await audit(c, req.user, 'eb.census.upload', 'eb_scheme', id, null, { added, updated });
    return { added, updated };
  });
  res.status(201).json(out);
}));

ebRouter.post('/schemes/:id/members/:memberId/withdraw', wrap(async (req, res) => {
  const id = idParam(req.params.id); const memberId = idParam(req.params.memberId);
  const r = await query("UPDATE eb_members SET status='withdrawn' WHERE id=$1 AND scheme_id=$2 AND status='active' RETURNING id", [memberId, id]);
  if (!r.length) throw notFound('Active member not found');
  res.json({ ok: true });
}));
