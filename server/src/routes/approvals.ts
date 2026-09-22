import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requireApprover, requireModule } from '../lib/auth.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { decideApproval } from '../domain/approvals.js';

export const approvalsRouter = Router();
approvalsRouter.use(requireModule('CORE'));

approvalsRouter.get('/', wrap(async (req, res) => {
  const status = String(req.query.status ?? 'pending');
  const q = String(req.query.q ?? '').trim();
  res.json({ approvals: await query(
    `SELECT a.*, m.full_name AS maker_name, ch.full_name AS checker_name FROM approvals a JOIN users m ON m.id=a.maker_id LEFT JOIN users ch ON ch.id=a.checker_id
     WHERE ($1 = '' OR a.status = $1) AND ($2 = '' OR a.summary ILIKE '%'||$2||'%') ORDER BY a.created_at DESC LIMIT 200`, [status, q]) });
}));

approvalsRouter.post('/:id/decide', requireApprover, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { decision, note } = parse(z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().optional() }), req.body);
  const out = await tx((c) => decideApproval(c, req.user!, id, decision, note));
  res.json(out);
}));

export const auditRouter = Router();
auditRouter.use(requireModule('CORE', 'UAM'));
auditRouter.get('/', wrap(async (req, res) => {
  const entity = String(req.query.entity ?? '');
  const entityId = String(req.query.entityId ?? '');
  const q = String(req.query.q ?? '').trim();
  res.json({ entries: await query(
    `SELECT * FROM audit_log WHERE ($1 = '' OR entity = $1) AND ($2 = '' OR entity_id = $2) AND ($3 = '' OR action ILIKE '%'||$3||'%' OR username ILIKE '%'||$3||'%') ORDER BY id DESC LIMIT 300`, [entity, entityId, q]) });
}));

export const outboxRouter = Router();
outboxRouter.use(requireModule('CORE', 'CSF', 'RN', 'NB', 'ADA'));
outboxRouter.get('/', wrap(async (_req, res) => { res.json({ emails: await query('SELECT * FROM email_outbox ORDER BY id DESC LIMIT 200') }); }));
