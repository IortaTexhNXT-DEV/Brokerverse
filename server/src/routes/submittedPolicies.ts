import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { classifyRow } from '@brokerverse/shared';

export const submittedRouter = Router();
submittedRouter.use(requireModule('SP'));

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
    rows: z.array(z.object({ policyNo: z.string(), clientName: z.string(), premium: z.number().nullable() })).min(1).max(5000),
  }), req.body);
  if (!(await one('SELECT 1 FROM insurers WHERE id=$1', [b.insurerId]))) throw notFound('Insurer not found');
  const inForce = await query<any>("SELECT p.id, p.policy_no, p.expiry_date, cl.name AS client_name FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.status='in_force' AND p.insurer_id=$1", [b.insurerId]);
  const byNo = new Map(inForce.map((p) => [p.policy_no, p.id]));
  const out = await tx(async (c) => {
    const batchNo = await nextNumber(c, 'SPB', 'SPB');
    const counts = { masterlist: 0, renewal: 0, excluded: 0, fallout: 0 };
    const batch = await one<{ id: number }>('INSERT INTO submitted_batches(batch_no, insurer_id, file_name, total_rows, uploaded_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [batchNo, b.insurerId, b.fileName, b.rows.length, req.user!.id], c);
    const now = new Date();
    for (const row of b.rows) {
      const r = classifyRow(row, inForce.map((p) => ({ policyNo: p.policy_no, expiryDate: p.expiry_date, clientName: p.client_name })), now);
      counts[r.classification]++;
      await query('INSERT INTO submitted_rows(batch_id, policy_no_raw, client_name_raw, premium_raw, classification, matched_policy_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [batch!.id, row.policyNo, row.clientName, row.premium, r.classification, r.matchedPolicyNo ? byNo.get(r.matchedPolicyNo) ?? null : null], c);
    }
    await query('UPDATE submitted_batches SET masterlist=$2, renewal=$3, excluded=$4, fallout=$5 WHERE id=$1', [batch!.id, counts.masterlist, counts.renewal, counts.excluded, counts.fallout], c);
    await audit(c, req.user, 'submitted.batch.upload', 'submitted_batch', batch!.id, null, { batchNo, ...counts });
    return { id: batch!.id, batchNo, ...counts };
  });
  res.status(201).json(out);
}));
