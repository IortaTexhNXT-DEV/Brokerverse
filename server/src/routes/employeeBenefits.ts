import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound, createApproval } from '../lib/kit.js';
import { registerApprovalHandler } from '../domain/approvals.js';

export const ebRouter = Router();
ebRouter.use(requireModule('EB'));

const schemeSelect = `SELECT s.*, cl.name AS client_name, i.name AS insurer_name,
  (SELECT COUNT(*)::int FROM eb_members m WHERE m.scheme_id=s.id AND m.status='active') AS active_members,
  (SELECT COALESCE(SUM(1 + m.dependents),0)::int FROM eb_members m WHERE m.scheme_id=s.id AND m.status='active') AS covered_lives,
  (SELECT COUNT(*)::int FROM eb_proposals pr WHERE pr.scheme_id=s.id AND pr.status IN ('received','shortlisted','awarded')) AS proposals_received
  FROM eb_schemes s JOIN clients cl ON cl.id=s.client_id JOIN insurers i ON i.id=s.insurer_id`;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SCHEME_NOT_FOUND = 'Scheme not found';
const withPremium = (s: any) => ({ ...s, annual_premium: Math.round(s.per_member_premium * s.covered_lives * 100) / 100 });

ebRouter.get('/schemes', wrap(async (_req, res) => { res.json({ schemes: (await query<any>(`${schemeSelect} ORDER BY s.id DESC`)).map(withPremium) }); }));

ebRouter.post('/schemes', wrap(async (req, res) => {
  const b = parse(z.object({ clientId: z.number().int().positive(), insurerId: z.number().int().positive(), planName: z.string().min(2), perMemberPremium: z.number().positive(), inceptionDate: DATE }), req.body);
  const client = await one<any>('SELECT * FROM clients WHERE id=$1', [b.clientId]);
  if (!client) throw notFound('Client not found');
  if (client.type !== 'corporate') throw conflict('Employee benefits schemes require a corporate client');
  if (['hit', 'declined'].includes(client.screening_status)) throw conflict('Client is blocked by sanctions screening');
  const inception = new Date(`${b.inceptionDate}T00:00:00Z`); const expiry = new Date(inception); expiry.setUTCFullYear(expiry.getUTCFullYear() + 1); expiry.setUTCDate(expiry.getUTCDate() - 1);
  const out = await tx(async (c) => {
    const schemeNo = await nextNumber(c, 'EB', 'EB');
    const r = await one<{ id: number }>("INSERT INTO eb_schemes(scheme_no, client_id, insurer_id, plan_name, per_member_premium, inception_date, expiry_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'prospect') RETURNING id",
      [schemeNo, b.clientId, b.insurerId, b.planName, b.perMemberPremium, b.inceptionDate, expiry.toISOString().slice(0, 10)], c);
    await audit(c, req.user, { action: 'eb.scheme.create', entity: 'eb_scheme', entityId: r!.id, after: { schemeNo, ...b } });
    return { id: r!.id, schemeNo };
  });
  res.status(201).json(out);
}));

ebRouter.get('/schemes/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const scheme = await one<any>(`${schemeSelect} WHERE s.id=$1`, [id]);
  if (!scheme) throw notFound(SCHEME_NOT_FOUND);
  const [members, proposals] = await Promise.all([
    query('SELECT * FROM eb_members WHERE scheme_id=$1 ORDER BY member_no', [id]),
    query('SELECT p.*, i.name AS insurer_name, i.accredited FROM eb_proposals p JOIN insurers i ON i.id=p.insurer_id WHERE p.scheme_id=$1 ORDER BY p.premium_per_life NULLS LAST', [id]),
  ]);
  res.json({ scheme: withPremium(scheme), members, proposals });
}));

/** Census upload (master list): upsert members; withdrawn members are re-activated when they reappear. */
ebRouter.post('/schemes/:id/members', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ members: z.array(z.object({ memberNo: z.string().min(1), name: z.string().min(2), birthDate: DATE.optional(), dependents: z.number().int().min(0).default(0) })).min(1) }), req.body);
  if (!(await one('SELECT 1 FROM eb_schemes WHERE id=$1', [id]))) throw notFound(SCHEME_NOT_FOUND);
  const out = await tx(async (c) => {
    let added = 0, updated = 0;
    for (const m of b.members) {
      const r = await one<{ inserted: boolean }>(`INSERT INTO eb_members(scheme_id, member_no, name, birth_date, dependents) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (scheme_id, member_no) DO UPDATE SET name=EXCLUDED.name, birth_date=EXCLUDED.birth_date, dependents=EXCLUDED.dependents, status='active' RETURNING (xmax = 0) AS inserted`, [id, m.memberNo, m.name, m.birthDate ?? null, m.dependents], c);
      if (r!.inserted) added++; else updated++;
    }
    await audit(c, req.user, { action: 'eb.census.upload', entity: 'eb_scheme', entityId: id, after: { added, updated } });
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

/** BOR (broker of record) and TOR (terms of reference) are prerequisites for remarketing and award. */
ebRouter.post('/schemes/:id/documents', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ borReceived: z.boolean().optional(), torPrepared: z.boolean().optional() }), req.body);
  const r = await query('UPDATE eb_schemes SET bor_received=COALESCE($2,bor_received), tor_prepared=COALESCE($3,tor_prepared) WHERE id=$1 RETURNING bor_received, tor_prepared', [id, b.borReceived ?? null, b.torPrepared ?? null]);
  if (!r.length) throw notFound(SCHEME_NOT_FOUND);
  res.json(r[0]);
}));

/** Remarketing: release TOR, master list and utilisation to insurers with approved franchise; proposals come back for comparison. */
ebRouter.post('/schemes/:id/proposals', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ insurerIds: z.array(z.number().int().positive()).min(1) }), req.body);
  const s = await one<any>('SELECT * FROM eb_schemes WHERE id=$1', [id]);
  if (!s) throw notFound(SCHEME_NOT_FOUND);
  if (!s.bor_received || !s.tor_prepared) throw conflict('BOR must be received and TOR prepared before releasing to insurers');
  await tx(async (c) => {
    for (const ins of b.insurerIds) await query("INSERT INTO eb_proposals(scheme_id, insurer_id, status) VALUES ($1,$2,'requested') ON CONFLICT DO NOTHING", [id, ins], c);
    await query("UPDATE eb_schemes SET status='remarketing' WHERE id=$1 AND status IN ('prospect','active')", [id], c);
    await sendMail(c, { to: 'eb-insurers@brokerverse.local', subject: `TOR release – ${s.scheme_no}`, body: 'TOR, master list and utilisation attached for proposal.', template: 'eb-tor-release', refType: 'eb_scheme', refId: id });
    await audit(c, req.user, { action: 'eb.remarket', entity: 'eb_scheme', entityId: id, after: b });
  });
  res.status(201).json({ ok: true });
}));

ebRouter.post('/schemes/:id/proposals/:insurerId', wrap(async (req, res) => {
  const id = idParam(req.params.id); const insurerId = idParam(req.params.insurerId);
  const b = parse(z.object({ premiumPerLife: z.number().positive(), benefits: z.string().min(3), capabilitiesScore: z.number().int().min(0).max(100).default(50), status: z.enum(['received', 'shortlisted', 'declined']).default('received') }), req.body);
  const r = await query('UPDATE eb_proposals SET premium_per_life=$3, benefits=$4, capabilities_score=$5, status=$6, received_at=now() WHERE scheme_id=$1 AND insurer_id=$2 RETURNING id', [id, insurerId, b.premiumPerLife, b.benefits, b.capabilitiesScore, b.status]);
  if (!r.length) throw notFound('Proposal request not found for this insurer');
  res.json({ ok: true });
}));

registerApprovalHandler('eb_award', async (c, a, decision) => {
  if (decision !== 'approved') { await query("UPDATE eb_schemes SET status='remarketing', awarded_proposal_id=NULL WHERE id=$1", [a.entity_id], c); return { awarded: false }; }
  await finalizeAward(c, a.entity_id, (a.payload as any).proposalId);
  return { awarded: true };
});

async function finalizeAward(c: any, schemeId: number, proposalId: number) {
  const p = await one<any>('SELECT * FROM eb_proposals WHERE id=$1', [proposalId], c);
  await query("UPDATE eb_proposals SET status='awarded' WHERE id=$1", [proposalId], c);
  await query("UPDATE eb_proposals SET status='declined' WHERE scheme_id=$1 AND id<>$2 AND status IN ('received','shortlisted')", [schemeId, proposalId], c);
  await query("UPDATE eb_schemes SET status='placed', insurer_id=$2, per_member_premium=$3, awarded_proposal_id=$4 WHERE id=$1", [schemeId, p.insurer_id, p.premium_per_life, proposalId], c);
  await sendMail(c, { to: 'processing;collections@brokerverse.local', subject: `EB placement handoff – scheme ${schemeId}`, body: 'Placement confirmed; proceed with booking and collections.', template: 'eb-handoff', refType: 'eb_scheme', refId: schemeId });
}

/** Award after client confirmation. Non-accredited providers need ISACOM approval (maker-checker). */
ebRouter.post('/schemes/:id/award', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { proposalId } = parse(z.object({ proposalId: z.number().int().positive() }), req.body);
  const out = await tx(async (c) => {
    const s = await one<any>('SELECT * FROM eb_schemes WHERE id=$1 FOR UPDATE', [id], c);
    if (!s) throw notFound(SCHEME_NOT_FOUND);
    const p = await one<any>('SELECT p.*, i.accredited, i.name AS insurer_name FROM eb_proposals p JOIN insurers i ON i.id=p.insurer_id WHERE p.id=$1 AND p.scheme_id=$2', [proposalId, id], c);
    if (!p || !['received', 'shortlisted'].includes(p.status)) throw conflict('Proposal is not available for award');
    if (!p.accredited) {
      await query("UPDATE eb_schemes SET isacom_required=true, awarded_proposal_id=$2 WHERE id=$1", [id, proposalId], c);
      const approvalId = await createApproval(c, req.user!, { requestType: 'eb_award', entity: 'eb_scheme', entityId: id, summary: `ISACOM approval: award ${s.scheme_no} to non-accredited ${p.insurer_name}`, payload: { proposalId } });
      return { status: 'isacom_pending', approvalId };
    }
    await finalizeAward(c, id, proposalId);
    await audit(c, req.user, { action: 'eb.award', entity: 'eb_scheme', entityId: id, after: { proposalId } });
    return { status: 'placed' };
  });
  res.status(201).json(out);
}));
