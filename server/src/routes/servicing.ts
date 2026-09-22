import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireModule } from '../lib/auth.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { wrap } from '../lib/async.js';
import { audit } from '../lib/audit.js';
import { nextNumber } from '../lib/numbering.js';
import { SERVICE_UNITS } from '@brokerverse/shared';

export const servicingRouter = Router();
servicingRouter.use(requireModule('CSF', 'CLM', 'CLXN'));

servicingRouter.get('/requests', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  res.json({ requests: await query(`SELECT s.*, cl.name AS client_name, cl.client_no, u.full_name AS created_by_name FROM service_requests s LEFT JOIN clients cl ON cl.id=s.client_id LEFT JOIN users u ON u.id=s.created_by WHERE ($1 = '' OR s.status=$1) ORDER BY s.id DESC LIMIT 500`, [status]) });
}));

/** Caller identity verification then request → owning-unit routing by category. */
servicingRouter.post('/requests', wrap(async (req, res) => {
  const b = parse(z.object({
    clientId: z.number().int().positive().optional(), channel: z.enum(['email', 'phone', 'walk-in', 'portal']).default('email'),
    category: z.enum(['claims', 'billing', 'policy', 'renewal', 'complaint', 'document']), description: z.string().min(5),
    identityVerified: z.boolean().default(false), verificationAnswer: z.string().optional(),
  }), req.body);
  let verified = b.identityVerified;
  if (b.clientId) {
    const client = await one<any>('SELECT * FROM clients WHERE id=$1', [b.clientId]);
    if (!client) throw notFound('Client not found');
    // Identity challenge: the caller must quote their TIN or registered email
    if (b.verificationAnswer) verified = [client.tin, client.email].filter(Boolean).some((v: string) => v.toLowerCase() === b.verificationAnswer!.toLowerCase());
    if (b.channel === 'phone' && !verified) throw conflict('Caller identity not verified: quote the registered TIN or email');
  }
  const owningUnit = SERVICE_UNITS[b.category] ?? 'CSF';
  const out = await tx(async (c) => {
    const requestNo = await nextNumber(c, 'SR', 'SR');
    const r = await one<{ id: number }>('INSERT INTO service_requests(request_no, client_id, channel, category, description, owning_unit, identity_verified, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [requestNo, b.clientId ?? null, b.channel, b.category, b.description, owningUnit, verified, req.user!.id], c);
    await audit(c, req.user, 'service.request.create', 'service_request', r!.id, null, { requestNo, owningUnit, verified });
    return { id: r!.id, requestNo, owningUnit, identityVerified: verified };
  });
  res.status(201).json(out);
}));

servicingRouter.post('/requests/:id/status', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const { status } = parse(z.object({ status: z.enum(['in_progress', 'resolved', 'closed']) }), req.body);
  const r = await one<any>('SELECT * FROM service_requests WHERE id=$1', [id]);
  if (!r) throw notFound('Request not found');
  const allowed: Record<string, string[]> = { open: ['in_progress', 'resolved'], in_progress: ['resolved'], resolved: ['closed'] };
  if (!allowed[r.status]?.includes(status)) throw conflict(`Cannot move a ${r.status} request to ${status}`);
  await tx(async (c) => {
    await query('UPDATE service_requests SET status=$2, resolved_at = CASE WHEN $2 IN (\'resolved\',\'closed\') THEN COALESCE(resolved_at, now()) ELSE resolved_at END WHERE id=$1', [id, status], c);
    await audit(c, req.user, 'service.request.status', 'service_request', id, { status: r.status }, { status });
  });
  res.json({ ok: true });
}));
