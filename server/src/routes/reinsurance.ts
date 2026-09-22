import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound, round2 } from '../lib/kit.js';

export const reinsuranceRouter = Router();
reinsuranceRouter.use(requireModule('RI'));

const RATING_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'NR'];
const MIN_RATING = 'BBB';
const ratingOk = (r: string) => RATING_ORDER.indexOf(r.toUpperCase()) !== -1 && RATING_ORDER.indexOf(r.toUpperCase()) <= RATING_ORDER.indexOf(MIN_RATING);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ACK_TAT_HOURS = 24;
const SLIP_TAT_DAYS = 3;

reinsuranceRouter.get('/treaties', wrap(async (_req, res) => {
  res.json({ treaties: await query(`SELECT t.*, COALESCE(SUM(c.ceded_sum_insured),0) AS utilised, COUNT(c.id)::int AS cessions FROM treaties t LEFT JOIN cessions c ON c.treaty_id=t.id GROUP BY t.id ORDER BY t.code`) });
}));

reinsuranceRouter.post('/treaties', wrap(async (req, res) => {
  const b = parse(z.object({
    code: z.string().min(2).max(12), name: z.string().min(2), reinsurer: z.string().min(2), reinsurerRating: z.string().default('A'),
    type: z.enum(['quota_share', 'surplus', 'xol', 'facultative']), cessionRate: z.number().min(0).max(1), capacity: z.number().positive(), inceptionDate: DATE, expiryDate: DATE,
  }), req.body);
  if (!ratingOk(b.reinsurerRating)) throw conflict(`Security rating gate: reinsurer must be rated ${MIN_RATING} or better`);
  if (await one('SELECT 1 FROM treaties WHERE code=$1', [b.code])) throw conflict('Treaty code already exists');
  const r = await tx(async (c) => {
    const row = await one<{ id: number }>('INSERT INTO treaties(code, name, reinsurer, reinsurer_rating, type, cession_rate, capacity, inception_date, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [b.code, b.name, b.reinsurer, b.reinsurerRating.toUpperCase(), b.type, b.cessionRate, b.capacity, b.inceptionDate, b.expiryDate], c);
    await audit(c, req.user, { action: 'treaty.create', entity: 'treaty', entityId: row!.id, after: b });
    return row!;
  });
  res.status(201).json({ id: r.id });
}));

reinsuranceRouter.get('/cessions', wrap(async (_req, res) => {
  res.json({ cessions: await query('SELECT c.*, t.code AS treaty_code, t.reinsurer, p.policy_no, cl.name AS client_name FROM cessions c JOIN treaties t ON t.id=c.treaty_id JOIN policies p ON p.id=c.policy_id JOIN clients cl ON cl.id=p.client_id ORDER BY c.id DESC LIMIT 300') });
}));

/** Treaty cession: rating gate, treaty period and capacity checks on an in-force policy. */
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
    const cededSI = round2(p.sum_insured * t.cession_rate);
    const cededPrem = round2(p.premium * t.cession_rate);
    if (t.utilised + cededSI > t.capacity) throw conflict(`Treaty capacity exceeded: ${Number(t.utilised).toFixed(2)} used of ${Number(t.capacity).toFixed(2)}`);
    if (await one('SELECT 1 FROM cessions WHERE policy_id=$1 AND treaty_id=$2', [p.id, t.id], c)) throw conflict('Policy already ceded to this treaty');
    const r = await one<{ id: number }>('INSERT INTO cessions(policy_id, treaty_id, ceded_sum_insured, ceded_premium, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [p.id, t.id, cededSI, cededPrem, req.user!.id], c);
    await audit(c, req.user, { action: 'cession.create', entity: 'cession', entityId: r!.id, after: { policyNo: p.policy_no, treaty: t.code, cededSI, cededPrem } });
    return { id: r!.id, cededSumInsured: cededSI, cededPremium: cededPrem };
  });
  res.status(201).json(out);
}));

/* ---------- Facultative placement (TSU → RI) with TATs: acknowledge within 24h, slip within 3 working days ---------- */
const placementSelect = `SELECT r.*, p.policy_no, t.request_no AS tsu_request_no,
  (r.status='requested' AND r.ack_due_at < now()) AS ack_overdue,
  (r.status IN ('acknowledged') AND r.slip_due_at < now()) AS slip_overdue,
  (SELECT COALESCE(SUM(share),0) FROM ri_placement_lines l WHERE l.placement_id=r.id) AS placed_share
  FROM ri_placements r LEFT JOIN policies p ON p.id=r.policy_id LEFT JOIN tsu_requests t ON t.id=r.tsu_request_id`;

reinsuranceRouter.get('/placements', wrap(async (_req, res) => { res.json({ placements: await query(`${placementSelect} ORDER BY r.id DESC LIMIT 200`) }); }));
reinsuranceRouter.get('/placements/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const placement = await one(`${placementSelect} WHERE r.id=$1`, [id]);
  if (!placement) throw notFound('Placement not found');
  res.json({ placement, lines: await query('SELECT * FROM ri_placement_lines WHERE placement_id=$1 ORDER BY id', [id]) });
}));

function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from); let left = days;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--; }
  return d;
}

reinsuranceRouter.post('/placements', requireModule('RI', 'PM'), wrap(async (req, res) => {
  const b = parse(z.object({ cedant: z.string().min(2), riskDescription: z.string().min(10), sumInsured: z.number().positive(), requestedShare: z.number().gt(0).max(1), tsuRequestId: z.number().int().positive().optional(), policyNo: z.string().optional() }), req.body);
  const policy = b.policyNo ? await one<any>('SELECT id FROM policies WHERE policy_no=$1', [b.policyNo.toUpperCase()]) : null;
  if (b.policyNo && !policy) throw notFound('Policy not found');
  const out = await tx(async (c) => {
    const requestNo = await nextNumber(c, 'FAC', 'FAC');
    const r = await one<{ id: number }>('INSERT INTO ri_placements(request_no, tsu_request_id, policy_id, cedant, risk_description, sum_insured, requested_share, ack_due_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval \'24 hours\', $8) RETURNING id',
      [requestNo, b.tsuRequestId ?? null, policy?.id ?? null, b.cedant, b.riskDescription, b.sumInsured, b.requestedShare, req.user!.id], c);
    await audit(c, req.user, { action: 'ri.placement.request', entity: 'ri_placement', entityId: r!.id, after: { requestNo, ackTatHours: ACK_TAT_HOURS } });
    return { id: r!.id, requestNo };
  });
  res.status(201).json(out);
}));

const PLACEMENT_TRANSITIONS: Record<string, string[]> = { requested: ['acknowledged', 'info_incomplete'], info_incomplete: ['requested'], acknowledged: ['slip_prepared', 'declined'], slip_prepared: ['slip_prepared', 'placed', 'declined'] };

const lineSchema = z.object({ reinsurer: z.string().min(2), rating: z.string().min(1), share: z.number().gt(0).max(1), premium: z.number().min(0).default(0), signedSlip: z.boolean().default(false), conditions: z.string().optional() });
type SlipLine = z.infer<typeof lineSchema>;

async function acknowledge(c: any, id: number) {
  await query('UPDATE ri_placements SET acknowledged_at=now(), slip_due_at=$2 WHERE id=$1', [id, addWorkingDays(new Date(), SLIP_TAT_DAYS)], c);
}

/** Reinsurance slip: every reinsurer must pass the security-rating gate. */
async function prepareSlip(c: any, id: number, lines: SlipLine[] | undefined) {
  if (!lines?.length) throw conflict('Reinsurance slip needs at least one reinsurer line');
  for (const l of lines) if (!ratingOk(l.rating)) throw conflict(`Security rating gate: ${l.reinsurer} is rated ${l.rating}`);
  await query('DELETE FROM ri_placement_lines WHERE placement_id=$1', [id], c);
  for (const l of lines) await query('INSERT INTO ri_placement_lines(placement_id, reinsurer, rating, share, premium, signed_slip, conditions) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, l.reinsurer, l.rating.toUpperCase(), l.share, l.premium, l.signedSlip, l.conditions ?? null], c);
  await query('UPDATE ri_placements SET slip_prepared_at=now() WHERE id=$1', [id], c);
}

/** Closing: the share sought must be fully placed on duly signed slips; a debit note goes to the cedant. */
async function closePlacement(c: any, r: any) {
  const lines = await query<any>('SELECT * FROM ri_placement_lines WHERE placement_id=$1', [r.id], c);
  const placed = lines.reduce((s, l) => s + Number(l.share), 0);
  if (placed + 1e-6 < Number(r.requested_share)) throw conflict(`Only ${(placed * 100).toFixed(2)}% placed of the ${(r.requested_share * 100).toFixed(2)}% sought`);
  if (lines.some((l) => !l.signed_slip)) throw conflict('Secure duly signed placement slips from every reinsurer before closing');
  const debitNoteNo = await nextNumber(c, 'DN', 'DN');
  await query('UPDATE ri_placements SET placed_at=now(), debit_note_no=$2 WHERE id=$1', [r.id, debitNoteNo], c);
  const panel = lines.map((l) => `${l.reinsurer} ${(l.share * 100).toFixed(2)}%`).join(', ');
  await sendMail(c, { to: `${String(r.cedant).toLowerCase().replaceAll(/[^a-z]/g, '')}@cedant.local`, subject: `Closing and debit note ${debitNoteNo} – ${r.request_no}`, body: `Facultative placement closed: ${panel}.`, template: 'ri-closing', refType: 'ri_placement', refId: r.id });
  return debitNoteNo;
}

reinsuranceRouter.post('/placements/:id/transition', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ to: z.enum(['acknowledged', 'info_incomplete', 'requested', 'slip_prepared', 'placed', 'declined']), note: z.string().optional(), lines: z.array(lineSchema).optional() }), req.body);
  const out = await tx(async (c) => {
    const r = await one<any>('SELECT * FROM ri_placements WHERE id=$1 FOR UPDATE', [id], c);
    if (!r) throw notFound('Placement not found');
    if (!PLACEMENT_TRANSITIONS[r.status]?.includes(b.to)) throw conflict(`Cannot move a ${r.status} placement to ${b.to}`);
    let debitNoteNo: string | null = null;
    if (b.to === 'acknowledged') await acknowledge(c, id);
    if (b.to === 'slip_prepared') await prepareSlip(c, id, b.lines);
    if (b.to === 'placed') debitNoteNo = await closePlacement(c, r);
    await query('UPDATE ri_placements SET status=$2 WHERE id=$1', [id, b.to], c);
    await audit(c, req.user, { action: `ri.placement.${b.to}`, entity: 'ri_placement', entityId: id, before: { status: r.status }, after: { status: b.to, note: b.note, debitNoteNo } });
    return { ok: true, status: b.to, debitNoteNo };
  });
  res.json(out);
}));
