import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, sendMail, idParam, parse, conflict, notFound } from '../lib/kit.js';
import { classifyRow } from '@brokerverse/shared';

export const submittedRouter = Router();
submittedRouter.use(requireModule('SP'));

const SUBMITTED_EXPIRY_WINDOW_DAYS = 150; // sent to the sanitation handler 150 days from expiry month
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

submittedRouter.get('/batches', wrap(async (_req, res) => {
  res.json({ batches: await query('SELECT b.*, i.name AS insurer_name, u.full_name AS uploaded_by_name FROM submitted_batches b JOIN insurers i ON i.id=b.insurer_id LEFT JOIN users u ON u.id=b.uploaded_by ORDER BY b.id DESC LIMIT 200') });
}));

submittedRouter.get('/batches/:id', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const batch = await one('SELECT b.*, i.name AS insurer_name FROM submitted_batches b JOIN insurers i ON i.id=b.insurer_id WHERE b.id=$1', [id]);
  if (!batch) throw notFound('Batch not found');
  res.json({ batch, rows: await query('SELECT r.*, p.policy_no AS matched_policy_no FROM submitted_rows r LEFT JOIN policies p ON p.id=r.matched_policy_id WHERE batch_id=$1 ORDER BY r.id', [id]) });
}));

/** Masterlist pipeline: sanitise → match in-force → classify Masterlist / Renewal / Excluded / Fallout. */
submittedRouter.post('/batches', wrap(async (req, res) => {
  const b = parse(z.object({
    insurerId: z.number().int().positive(), fileName: z.string().min(1),
    rows: z.array(z.object({ policyNo: z.string(), clientName: z.string(), premium: z.number().nullable(), insurerName: z.string().optional(), expiryDate: DATE.optional() })).min(1).max(5000),
  }), req.body);
  if (!(await one('SELECT 1 FROM insurers WHERE id=$1', [b.insurerId]))) throw notFound('Insurer not found');
  const inForce = await query<any>("SELECT p.id, p.policy_no, p.expiry_date, cl.name AS client_name FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.status='in_force' AND p.insurer_id=$1", [b.insurerId]);
  const byNo = new Map(inForce.map((p) => [p.policy_no, p.id]));
  const catalogue = inForce.map((p) => ({ policyNo: p.policy_no, expiryDate: p.expiry_date, clientName: p.client_name }));
  const out = await tx(async (c) => {
    const batchNo = await nextNumber(c, 'SPB', 'SPB');
    const counts = { masterlist: 0, renewal: 0, excluded: 0, fallout: 0 };
    const batch = await one<{ id: number }>('INSERT INTO submitted_batches(batch_no, insurer_id, file_name, total_rows, uploaded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [batchNo, b.insurerId, b.fileName, b.rows.length, req.user!.id], c);
    const now = new Date();
    for (const row of b.rows) {
      const r = classifyRow(row, catalogue, now);
      counts[r.classification]++;
      await query('INSERT INTO submitted_rows(batch_id, policy_no_raw, client_name_raw, premium_raw, classification, matched_policy_id, insurer_name_raw, expiry_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [batch!.id, row.policyNo, row.clientName, row.premium, r.classification, r.matchedPolicyNo ? byNo.get(r.matchedPolicyNo) ?? null : null, row.insurerName ?? null, row.expiryDate ?? null], c);
    }
    await query('UPDATE submitted_batches SET masterlist=$2, renewal=$3, excluded=$4, fallout=$5 WHERE id=$1', [batch!.id, counts.masterlist, counts.renewal, counts.excluded, counts.fallout], c);
    await audit(c, req.user, { action: 'submitted.batch.upload', entity: 'submitted_batch', entityId: batch!.id, after: { batchNo, ...counts } });
    return { id: batch!.id, batchNo, ...counts };
  });
  res.status(201).json(out);
}));

/** Adequacy review of a submitted policy document: adequate, or findings → IAAF issued to the account officer / client. */
submittedRouter.post('/rows/:rowId/review', wrap(async (req, res) => {
  const rowId = idParam(req.params.rowId);
  const b = parse(z.object({ outcome: z.enum(['adequate', 'findings']), findings: z.string().optional(), issueIaaf: z.boolean().default(true) }), req.body);
  if (b.outcome === 'findings' && !b.findings) throw conflict('Describe the findings');
  const out = await tx(async (c) => {
    const row = await one<any>('SELECT r.*, b.batch_no FROM submitted_rows r JOIN submitted_batches b ON b.id=r.batch_id WHERE r.id=$1 FOR UPDATE OF r', [rowId], c);
    if (!row) throw notFound('Row not found');
    let iaafNo: string | null = null; let status = b.outcome as string;
    if (b.outcome === 'findings' && b.issueIaaf) {
      iaafNo = await nextNumber(c, 'IAAF', 'IAAF'); status = 'iaaf_issued';
      await sendMail(c, { to: 'account-officer@brokerverse.local', subject: `IAAF ${iaafNo} – ${row.policy_no_raw}`, body: `Insurance Adequacy Assessment Form for ${row.client_name_raw}: ${b.findings}`, template: 'iaaf', refType: 'submitted_row', refId: rowId });
    }
    await query('UPDATE submitted_rows SET adequacy_status=$2, findings=$3, iaaf_no=$4, reviewed_by=$5 WHERE id=$1', [rowId, status, b.findings ?? null, iaafNo, req.user!.id], c);
    await audit(c, req.user, { action: 'submitted.review', entity: 'submitted_row', entityId: rowId, after: { status, iaafNo } });
    return { status, iaafNo };
  });
  res.json(out);
}));

/** Submitted policies approaching expiry (150-day window) for the renewal/conversion (bidding) opportunity. */
submittedRouter.get('/expiring', wrap(async (_req, res) => {
  res.json({ rows: await query(`SELECT r.*, b.batch_no, b.insurer_id, (r.expiry_date - CURRENT_DATE) AS days_to_expiry FROM submitted_rows r JOIN submitted_batches b ON b.id=r.batch_id
    WHERE r.expiry_date IS NOT NULL AND r.expiry_date <= CURRENT_DATE + $1::int AND r.classification <> 'excluded' ORDER BY r.expiry_date`, [SUBMITTED_EXPIRY_WINDOW_DAYS]), window: SUBMITTED_EXPIRY_WINDOW_DAYS });
}));
