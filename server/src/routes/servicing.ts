import { Router, z, one, query, tx, requireModule, wrap, audit, nextNumber, idParam, parse, conflict, notFound } from '../lib/kit.js';
import { SERVICE_UNITS } from '@brokerverse/shared';

export const servicingRouter = Router();
servicingRouter.use(requireModule('CSF', 'CLM', 'CLXN'));

const caseSelect = `SELECT s.*, cl.name AS client_name, cl.client_no, u.full_name AS created_by_name,
  (s.status IN ('open','in_progress') AND s.tat_due_at < now()) AS past_tat FROM service_requests s LEFT JOIN clients cl ON cl.id=s.client_id LEFT JOIN users u ON u.id=s.created_by`;

servicingRouter.get('/requests', wrap(async (req, res) => {
  const status = String(req.query.status ?? '');
  const unit = String(req.query.unit ?? '');
  res.json({ requests: await query(`${caseSelect} WHERE ($1 = '' OR s.status=$1) AND ($2 = '' OR s.owning_unit=$2) ORDER BY s.id DESC LIMIT 500`, [status, unit]) });
}));

/** Customer servicing facility: search by invoice number, policy number or client name. */
servicingRouter.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ clients: [], policies: [], invoices: [] });
  const [clients, policies, invoices] = await Promise.all([
    query("SELECT id, client_no, name, type, email, phone, screening_status FROM clients WHERE name ILIKE '%'||$1||'%' OR client_no ILIKE '%'||$1||'%' LIMIT 20", [q]),
    query("SELECT p.id, p.policy_no, p.status, p.expiry_date, cl.name AS client_name, cl.id AS client_id FROM policies p JOIN clients cl ON cl.id=p.client_id WHERE p.policy_no ILIKE '%'||$1||'%' LIMIT 20", [q]),
    query("SELECT i.id, i.invoice_no, i.status, (i.amount - i.paid_amount) AS balance, p.policy_no, cl.name AS client_name, cl.id AS client_id FROM invoices i JOIN policies p ON p.id=i.policy_id JOIN clients cl ON cl.id=i.client_id WHERE i.invoice_no ILIKE '%'||$1||'%' LIMIT 20", [q]),
  ]);
  return res.json({ clients, policies, invoices });
}));

/** Contact-details update from the servicing screen. */
servicingRouter.patch('/clients/:id/contact', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ email: z.string().email().optional(), phone: z.string().min(5).optional(), address: z.string().min(3).optional() }), req.body);
  const before = await one<any>('SELECT id, email, phone, address FROM clients WHERE id=$1', [id]);
  if (!before) throw notFound('Client not found');
  await tx(async (c) => {
    await query('UPDATE clients SET email=COALESCE($2,email), phone=COALESCE($3,phone), address=COALESCE($4,address) WHERE id=$1', [id, b.email ?? null, b.phone ?? null, b.address ?? null], c);
    await audit(c, req.user, { action: 'client.contact.update', entity: 'client', entityId: id, before, after: b });
  });
  res.json({ ok: true });
}));

const caseSchema = z.object({
  clientId: z.number().int().positive().optional(), channel: z.enum(['email', 'phone', 'walk-in', 'portal']).default('email'),
  category: z.enum(['claims', 'billing', 'policy', 'renewal', 'complaint', 'document', 'inquiry']), description: z.string().min(5),
  verificationAnswer: z.string().optional(), handledAtPointOfContact: z.boolean().default(false), tatHours: z.number().int().min(1).max(720).optional(),
});

/** Positive identification: the caller quotes the registered TIN or email. */
function positiveIdentification(client: any, answer?: string): boolean {
  if (!answer) return false;
  return [client.tin, client.email].filter(Boolean).some((v: string) => v.toLowerCase() === answer.toLowerCase());
}

/** Case management: general inquiries close at the point of contact; account-related cases need PID and route to the owning unit with a TAT. */
servicingRouter.post('/requests', wrap(async (req, res) => {
  const b = parse(caseSchema, req.body);
  const client = b.clientId ? await one<any>('SELECT * FROM clients WHERE id=$1', [b.clientId]) : null;
  if (b.clientId && !client) throw notFound('Client not found');
  const caseType = client ? 'account_related' : 'general_inquiry';
  const pid = client ? positiveIdentification(client, b.verificationAnswer) : false;
  if (client && !pid) throw conflict('Positive identification failed: the caller must quote the registered TIN or email', { code: 'PID_FAILED' });
  const closeNow = caseType === 'general_inquiry' || b.handledAtPointOfContact;
  const owningUnit = closeNow ? 'CSF' : (SERVICE_UNITS[b.category] ?? 'CSF');
  const tatHours = b.tatHours ?? 48;
  const out = await tx(async (c) => {
    const requestNo = await nextNumber(c, 'SR', 'SR');
    const r = await one<{ id: number }>(
      `INSERT INTO service_requests(request_no, client_id, channel, category, description, owning_unit, identity_verified, case_type, tat_hours, tat_due_at, handled_at_point_of_contact, status, resolved_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::int, now() + make_interval(hours => $9::int), $10, $11, CASE WHEN $11='closed' THEN now() END, $12) RETURNING id`,
      [requestNo, b.clientId ?? null, b.channel, b.category, b.description, owningUnit, pid, caseType, tatHours, closeNow, closeNow ? 'closed' : 'open', req.user!.id], c);
    await audit(c, req.user, { action: 'service.request.create', entity: 'service_request', entityId: r!.id, after: { requestNo, owningUnit, caseType, pid, closeNow } });
    return { id: r!.id, requestNo, owningUnit, caseType, identityVerified: pid, status: closeNow ? 'closed' : 'open' };
  });
  res.status(201).json(out);
}));

const CASE_TRANSITIONS: Record<string, string[]> = { open: ['in_progress', 'resolved', 'returned'], in_progress: ['resolved', 'returned'], resolved: ['closed'], returned: ['open', 'closed'] };

/** Fulfilment unit resolves the case, or returns it to the contact centre for re-logging when it was mis-routed. */
servicingRouter.post('/requests/:id/status', wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = parse(z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'returned']), reason: z.string().optional() }), req.body);
  const r = await one<any>('SELECT * FROM service_requests WHERE id=$1', [id]);
  if (!r) throw notFound('Request not found');
  if (!CASE_TRANSITIONS[r.status]?.includes(b.status)) throw conflict(`Cannot move a ${r.status} case to ${b.status}`);
  if (b.status === 'returned' && !b.reason) throw conflict('A return reason is required');
  await tx(async (c) => {
    await query(`UPDATE service_requests SET status=$2, return_reason=COALESCE($3, return_reason),
      resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
      tat_due_at = CASE WHEN $2 = 'open' THEN now() + make_interval(hours => tat_hours) ELSE tat_due_at END WHERE id=$1`, [id, b.status, b.reason ?? null], c);
    await audit(c, req.user, { action: 'service.request.status', entity: 'service_request', entityId: id, before: { status: r.status }, after: { status: b.status, reason: b.reason } });
  });
  res.json({ ok: true });
}));
