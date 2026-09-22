import { Router, z, one, query, tx, requireApprover, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound, createApproval } from '../lib/kit.js';
import { registerApprovalHandler } from '../domain/approvals.js';
import { rate } from '@brokerverse/shared';

export const productsRouter = Router();
productsRouter.use(requireModule('PM', 'NB', 'RN', 'RPT'));

productsRouter.get('/', wrap(async (_req, res) => { res.json({ products: await query('SELECT * FROM products ORDER BY code') }); }));
productsRouter.get('/release-advisories', wrap(async (_req, res) => {
  res.json({ advisories: await query('SELECT a.*, p.code AS product_code, u.full_name AS approved_by_name FROM release_advisories a JOIN products p ON p.id=a.product_id LEFT JOIN users u ON u.id=a.approved_by ORDER BY a.id DESC LIMIT 200') });
}));

const productSchema = z.object({
  code: z.string().min(2).max(12).regex(/^[A-Z0-9_-]+$/), name: z.string().min(2), line: z.enum(['motor', 'property', 'fire', 'marine', 'casualty', 'accident', 'life', 'eb']),
  packaged: z.boolean().default(true), baseRate: z.number().positive().max(1), minPremium: z.number().min(0).default(0), commissionRate: z.number().min(0).max(0.5),
  vatRate: z.number().min(0).max(1).default(0.12), dstRate: z.number().min(0).max(1).default(0.125), lgtRate: z.number().min(0).max(1).default(0.0075), fstRate: z.number().min(0).max(1).default(0),
  maxSumInsured: z.number().positive().optional(), surveyRequiredAbove: z.number().positive().optional(),
});
const changeSchema = productSchema.partial().omit({ code: true }).extend({ status: z.enum(['active', 'retired']).optional() });

const COLS: Record<string, string> = { name: 'name', line: 'line', packaged: 'packaged', baseRate: 'base_rate', minPremium: 'min_premium', commissionRate: 'commission_rate', vatRate: 'vat_rate', dstRate: 'dst_rate', lgtRate: 'lgt_rate', fstRate: 'fst_rate', maxSumInsured: 'max_sum_insured', surveyRequiredAbove: 'survey_required_above', status: 'status' };

async function applyProductChange(c: any, productId: number, changes: Record<string, unknown>) {
  const sets: string[] = []; const vals: unknown[] = [productId];
  for (const [k, v] of Object.entries(changes)) {
    if (!(k in COLS) || v === undefined) continue;
    vals.push(v); sets.push(`${COLS[k]}=$${vals.length}`);
  }
  if (sets.length) await query(`UPDATE products SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, vals, c);
}

/** Package maintenance: TL approval creates/updates the package and publishes a release advisory. */
registerApprovalHandler('product_change', async (c, a, decision, checker) => {
  if (decision !== 'approved') return { applied: false };
  const p = a.payload as { changes: Record<string, unknown>; summary: string; effectiveDate: string };
  await applyProductChange(c, a.entity_id, p.changes);
  const advisoryNo = await nextNumber(c, 'RA', 'RADV');
  const product = await one<any>('SELECT code, name FROM products WHERE id=$1', [a.entity_id], c);
  await query('INSERT INTO release_advisories(advisory_no, product_id, summary, changes, effective_date, approved_by) VALUES ($1,$2,$3,$4,$5,$6)', [advisoryNo, a.entity_id, p.summary, JSON.stringify(p.changes), p.effectiveDate, checker.id], c);
  await sendMail(c, { to: 'marketing;operations;tsu@brokerverse.local', subject: `Release advisory ${advisoryNo} – ${product.code}`, body: `Package ${product.name} (${product.code}) updated effective ${p.effectiveDate}.\nChanges: ${JSON.stringify(p.changes)}\nApproval: #${a.id}`, template: 'release-advisory', refType: 'product', refId: a.entity_id });
  return { applied: true, advisoryNo };
});

/** New packages are created in draft (retired) by the maker; the approved maintenance request activates them. */
productsRouter.post('/', requireModule('PM'), wrap(async (req, res) => {
  const b = parse(productSchema, req.body);
  if (await one('SELECT 1 FROM products WHERE code=$1', [b.code])) throw conflict('Product code already exists');
  const out = await tx(async (c) => {
    const r = await one<{ id: number }>(
      `INSERT INTO products(code, name, line, packaged, base_rate, min_premium, commission_rate, vat_rate, dst_rate, lgt_rate, fst_rate, max_sum_insured, survey_required_above, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'retired') RETURNING id`,
      [b.code, b.name, b.line, b.packaged, b.baseRate, b.minPremium, b.commissionRate, b.vatRate, b.dstRate, b.lgtRate, b.fstRate, b.maxSumInsured ?? null, b.surveyRequiredAbove ?? null], c);
    const approvalId = await createApproval(c, req.user!, { requestType: 'product_change', entity: 'product', entityId: r!.id, summary: `Create package ${b.code} – ${b.name}`, payload: { changes: { status: 'active' }, summary: `New package ${b.code}`, effectiveDate: new Date().toISOString().slice(0, 10) } });
    await audit(c, req.user, { action: 'product.create', entity: 'product', entityId: r!.id, after: b });
    return { id: r!.id, approvalId };
  });
  res.status(201).json(out);
}));

/** Maintenance request (mover): changes are applied only after checker approval, with a release advisory. */
productsRouter.post('/:id/change-request', requireModule('PM'), wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ changes: changeSchema, summary: z.string().min(3), effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
  const before = await one<any>('SELECT * FROM products WHERE id=$1', [id]);
  if (!before) throw notFound('Product not found');
  const out = await tx(async (c) => {
    const approvalId = await createApproval(c, req.user!, { requestType: 'product_change', entity: 'product', entityId: id, summary: `Package maintenance ${before.code}: ${b.summary}`, payload: b });
    await audit(c, req.user, { action: 'product.change.request', entity: 'product', entityId: id, before, after: b.changes });
    return { approvalId };
  });
  res.status(201).json(out);
}));

/** Rating calculator (what-if) used by the quotation screen. */
productsRouter.post('/:id/rate', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { sumInsured } = parse(z.object({ sumInsured: z.number().positive() }), req.body);
  const p = await one<any>('SELECT * FROM products WHERE id=$1', [id]);
  if (!p) throw notFound('Product not found');
  if (p.max_sum_insured && sumInsured > p.max_sum_insured) throw conflict(`Sum insured exceeds product acceptance limit of ${p.max_sum_insured}`);
  const r = rate({ sumInsured, baseRate: p.base_rate, minPremium: p.min_premium, commissionRate: p.commission_rate, vatRate: p.vat_rate, dstRate: p.dst_rate, lgtRate: p.lgt_rate, fstRate: p.fst_rate });
  res.json({ ...r, surveyRequired: !!(p.survey_required_above && sumInsured > p.survey_required_above), packaged: p.packaged });
}));

export const insurersRouter = Router();
insurersRouter.use(requireModule('PM', 'NB', 'RI', 'ADA', 'SP', 'EB', 'RN', 'OPS'));
insurersRouter.get('/', wrap(async (_req, res) => { res.json({ insurers: await query('SELECT * FROM insurers ORDER BY code') }); }));
insurersRouter.post('/', requireModule('PM'), wrap(async (req, res) => {
  const b = parse(z.object({ code: z.string().min(2).max(10), name: z.string().min(2), securityRating: z.string().default('A'), accredited: z.boolean().default(true), sftpEnrolled: z.boolean().default(false) }), req.body);
  if (await one('SELECT 1 FROM insurers WHERE code=$1', [b.code])) throw conflict('Insurer code already exists');
  const r = await one<{ id: number }>('INSERT INTO insurers(code, name, security_rating, accredited, sftp_enrolled) VALUES ($1,$2,$3,$4,$5) RETURNING id', [b.code, b.name, b.securityRating, b.accredited, b.sftpEnrolled]);
  res.status(201).json({ id: r!.id });
}));

/* ---------------- TSU: technical services unit quotation slips for non-packaged accounts ---------------- */
export const tsuRouter = Router();
tsuRouter.use(requireModule('PM', 'NB', 'RI'));

const tsuSelect = `SELECT t.*, cl.name AS client_name, pr.code AS product_code, i.name AS selected_insurer_name,
  (SELECT COUNT(*)::int FROM tsu_insurer_responses r WHERE r.request_id=t.id) AS insurers_approached,
  (SELECT COUNT(*)::int FROM tsu_insurer_responses r WHERE r.request_id=t.id AND r.response='accepted') AS insurers_accepted
  FROM tsu_requests t JOIN clients cl ON cl.id=t.client_id LEFT JOIN products pr ON pr.id=t.product_id LEFT JOIN insurers i ON i.id=t.selected_insurer_id`;

tsuRouter.get('/', wrap(async (_req, res) => { res.json({ requests: await query(`${tsuSelect} ORDER BY t.id DESC LIMIT 300`) }); }));

tsuRouter.get('/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const request = await one(`${tsuSelect} WHERE t.id=$1`, [id]);
  if (!request) throw notFound('TSU request not found');
  const responses = await query('SELECT r.*, i.name AS insurer_name, i.security_rating FROM tsu_insurer_responses r JOIN insurers i ON i.id=r.insurer_id WHERE r.request_id=$1 ORDER BY r.premium NULLS LAST', [id]);
  res.json({ request, responses });
}));

/** Marketing submits the TSU request form; TSU checks completeness and acknowledges or returns it. */
tsuRouter.post('/', wrap(async (req, res) => {
  const b = parse(z.object({ clientId: z.number().int().positive(), productId: z.number().int().positive().optional(), line: z.string().min(2), sumInsured: z.number().positive(), riskDetails: z.string().min(10), expiringTerms: z.string().optional() }), req.body);
  if (!(await one('SELECT 1 FROM clients WHERE id=$1', [b.clientId]))) throw notFound('Client not found');
  const dup = await one("SELECT request_no FROM tsu_requests WHERE client_id=$1 AND line=$2 AND status NOT IN ('closed','declined','proposal_approved')", [b.clientId, b.line]);
  if (dup) throw conflict(`Duplicate request: ${dup.request_no} is still open for this client and line`);
  const out = await tx(async (c) => {
    const requestNo = await nextNumber(c, 'TSU', 'TSU');
    const r = await one<{ id: number }>('INSERT INTO tsu_requests(request_no, client_id, product_id, line, sum_insured, risk_details, expiring_terms, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [requestNo, b.clientId, b.productId ?? null, b.line, b.sumInsured, b.riskDetails, b.expiringTerms ?? null, req.user!.id], c);
    await audit(c, req.user, { action: 'tsu.request.create', entity: 'tsu_request', entityId: r!.id, after: { requestNo } });
    return { id: r!.id, requestNo };
  });
  res.status(201).json(out);
}));

const TSU_TRANSITIONS: Record<string, string[]> = {
  submitted: ['acknowledged', 'incomplete'], incomplete: ['submitted'], acknowledged: ['qs_prepared'], qs_prepared: ['qs_approved', 'acknowledged'],
  qs_approved: ['ri_referred', 'sent_to_insurers'], ri_referred: ['sent_to_insurers', 'acknowledged'], sent_to_insurers: ['comparative_ready'],
  comparative_ready: ['proposal_approved', 'sent_to_insurers', 'closed'], proposal_approved: ['closed'],
};
const APPROVER_ONLY = new Set(['qs_approved', 'proposal_approved']);

tsuRouter.post('/:id/transition', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ to: z.string(), quotationSlip: z.string().optional(), proposalSlip: z.string().optional(), selectedInsurerId: z.number().int().positive().optional(), note: z.string().optional(), insurerIds: z.array(z.number().int().positive()).optional() }), req.body);
  const t = await one<any>('SELECT * FROM tsu_requests WHERE id=$1', [id]);
  if (!t) throw notFound('TSU request not found');
  if (!TSU_TRANSITIONS[t.status]?.includes(b.to)) throw conflict(`Cannot move a ${t.status} request to ${b.to}`);
  if (APPROVER_ONLY.has(b.to) && !req.user!.canApprove) throw conflict('TL/Head approval required for this step');
  if (b.to === 'qs_prepared' && !b.quotationSlip) throw conflict('Quotation slip content is required');
  if (b.to === 'proposal_approved' && (!b.selectedInsurerId || !b.proposalSlip)) throw conflict('Proposal slip and selected insurer are required');
  await tx(async (c) => {
    await query(`UPDATE tsu_requests SET status=$2, quotation_slip=COALESCE($3, quotation_slip), proposal_slip=COALESCE($4, proposal_slip), selected_insurer_id=COALESCE($5, selected_insurer_id), requires_ri = CASE WHEN $2='ri_referred' THEN true ELSE requires_ri END, updated_at=now() WHERE id=$1`,
      [id, b.to, b.quotationSlip ?? null, b.proposalSlip ?? null, b.selectedInsurerId ?? null], c);
    if (b.to === 'sent_to_insurers') {
      for (const ins of b.insurerIds ?? []) await query("INSERT INTO tsu_insurer_responses(request_id, insurer_id, response) VALUES ($1,$2,'pending') ON CONFLICT DO NOTHING", [id, ins], c);
      await sendMail(c, { to: 'panel-insurers@brokerverse.local', subject: `Quotation slip ${t.request_no}`, body: t.quotation_slip ?? '', template: 'quotation-slip', refType: 'tsu_request', refId: id });
    }
    if (b.to === 'ri_referred') await sendMail(c, { to: 'reinsurance@brokerverse.local', subject: `RI review requested ${t.request_no}`, body: `Sum insured ${t.sum_insured}; ${t.risk_details}`, template: 'ri-referral', refType: 'tsu_request', refId: id });
    await audit(c, req.user, { action: `tsu.request.${b.to}`, entity: 'tsu_request', entityId: id, before: { status: t.status }, after: { status: b.to, note: b.note } });
  });
  res.json({ ok: true, status: b.to });
}));

/** Insurer response to the quotation slip: accepted (with evidence), declined (reason) or conditional (re-send). */
tsuRouter.post('/:id/responses', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ insurerId: z.number().int().positive(), response: z.enum(['accepted', 'declined', 'conditional']), premium: z.number().min(0).optional(), conditions: z.string().optional(), evidence: z.string().optional() }), req.body);
  const t = await one<any>('SELECT * FROM tsu_requests WHERE id=$1', [id]);
  if (!t) throw notFound('TSU request not found');
  if (t.status !== 'sent_to_insurers') throw conflict('The quotation slip has not been sent to insurers');
  if (b.response === 'accepted' && !b.evidence) throw conflict('Acceptance evidence (signed/stamped slip or explicit email) is required');
  await query(`INSERT INTO tsu_insurer_responses(request_id, insurer_id, response, premium, conditions, evidence, responded_at) VALUES ($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT (request_id, insurer_id) DO UPDATE SET response=EXCLUDED.response, premium=EXCLUDED.premium, conditions=EXCLUDED.conditions, evidence=EXCLUDED.evidence, responded_at=now()`,
    [id, b.insurerId, b.response, b.premium ?? null, b.conditions ?? null, b.evidence ?? null]);
  res.json({ ok: true });
}));

export const productApproverGuard = requireApprover;
