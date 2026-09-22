import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, idParam, parse, conflict, notFound } from '../lib/kit.js';

export const migrationRouter = Router();
migrationRouter.use(requireModule('DM'));

migrationRouter.get('/batches', wrap(async (_req, res) => {
  res.json({ batches: await query('SELECT b.*, u.full_name AS created_by_name FROM migration_batches b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.id DESC') });
}));

/** Register a legacy extract with its control totals, then load and reconcile count & value. */
migrationRouter.post('/batches', wrap(async (req, res) => {
  const b = parse(z.object({ entity: z.enum(['clients', 'policies', 'claims', 'receivables']), sourceCount: z.number().int().min(0), sourceValue: z.number().min(0).default(0) }), req.body);
  const out = await tx(async (c) => {
    const batchNo = await nextNumber(c, 'MIG', 'MIG');
    const r = await one<{ id: number }>('INSERT INTO migration_batches(batch_no, entity, source_count, source_value, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [batchNo, b.entity, b.sourceCount, b.sourceValue, req.user!.id], c);
    await audit(c, req.user, { action: 'migration.batch.create', entity: 'migration_batch', entityId: r!.id, after: { batchNo, ...b } });
    return { id: r!.id, batchNo };
  });
  res.status(201).json(out);
}));

migrationRouter.post('/batches/:id/load', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ loadedCount: z.number().int().min(0), loadedValue: z.number().min(0).default(0) }), req.body);
  const batch = await one<any>('SELECT * FROM migration_batches WHERE id=$1', [id]);
  if (!batch) throw notFound('Batch not found');
  if (batch.status === 'dispositioned') throw conflict('Batch already dispositioned');
  const countOk = b.loadedCount === batch.source_count;
  const valueOk = Math.abs(b.loadedValue - batch.source_value) < 0.005;
  const status = countOk && valueOk ? 'reconciled' : 'disposition_required';
  await tx(async (c) => {
    await query('UPDATE migration_batches SET loaded_count=$2, loaded_value=$3, status=$4 WHERE id=$1', [id, b.loadedCount, b.loadedValue, status], c);
    await audit(c, req.user, { action: 'migration.batch.load', entity: 'migration_batch', entityId: id, before: { status: batch.status }, after: { status, countOk, valueOk } });
  });
  res.json({ status, countOk, valueOk, countVariance: b.loadedCount - batch.source_count, valueVariance: Math.round((b.loadedValue - batch.source_value) * 100) / 100 });
}));

migrationRouter.post('/batches/:id/disposition', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { note } = parse(z.object({ note: z.string().min(5) }), req.body);
  const batch = await one<any>('SELECT * FROM migration_batches WHERE id=$1', [id]);
  if (!batch) throw notFound('Batch not found');
  if (batch.status !== 'disposition_required') throw conflict('Batch does not require disposition');
  await tx(async (c) => {
    await query("UPDATE migration_batches SET status='dispositioned', disposition_note=$2 WHERE id=$1", [id, note], c);
    await audit(c, req.user, { action: 'migration.batch.disposition', entity: 'migration_batch', entityId: id, before: { status: batch.status }, after: { status: 'dispositioned', note } });
  });
  res.json({ ok: true });
}));
