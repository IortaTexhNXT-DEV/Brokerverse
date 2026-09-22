import { Router, z, one, query, tx, requireModule, wrap, audit, sendMail, idParam, parse, conflict, notFound, createApproval, addDays } from '../lib/kit.js';
import { registerApprovalHandler } from '../domain/approvals.js';
import { invoiceSelect } from './operations.js';

export const collectionsRouter = Router();
collectionsRouter.use(requireModule('CLXN', 'OPS', 'RPT'));

const NEWLY_BOOKED_DAYS = 15;   // collect within 10–15 days from booking
const COMMITMENT_WINDOW_DAYS = 60; // secure a payment commitment within 60 days

type Bucket = 'current' | '0-30' | '31-60' | '61-90' | '91-180' | '180+';
function bucketOf(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '0-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  if (daysOverdue <= 180) return '91-180';
  return '180+';
}
/** Collection stage per the marketing-collections flow. */
function stageOf(r: any): string {
  if (r.days_since_booking <= NEWLY_BOOKED_DAYS) return 'newly_booked';
  if (r.days_overdue <= 0) return 'within_credit_term';
  if (r.last_category === 'committed' && r.commitment_date && r.commitment_date >= new Date().toISOString().slice(0, 10)) return 'committed';
  if (r.days_since_booking > COMMITMENT_WINDOW_DAYS) return 'escalate';
  return 'overdue';
}

/** Outstanding premiums (PR list) with ageing buckets, last effort and collection stage. */
collectionsRouter.get('/outstanding', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const rows = await query<any>(`${invoiceSelect}
    LEFT JOIN LATERAL (SELECT category AS last_category, commitment_date, effort_at AS last_effort_at FROM collection_efforts e WHERE e.invoice_id=i.id ORDER BY e.id DESC LIMIT 1) le ON true
    WHERE i.status <> 'paid' AND ($1 = '' OR cl.name ILIKE '%'||$1||'%' OR p.policy_no ILIKE '%'||$1||'%') ORDER BY i.due_date`, [q]);
  const buckets: Record<Bucket, number> = { current: 0, '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 };
  for (const r of rows) {
    r.bucket = bucketOf(r.days_overdue);
    r.stage = stageOf(r);
    buckets[r.bucket as Bucket] = Math.round((buckets[r.bucket as Bucket] + r.balance) * 100) / 100;
  }
  res.json({ invoices: rows, buckets, total: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100 });
}));

collectionsRouter.get('/statement/:clientId', wrap(async (req, res) => {
  const clientId = idParam(req.params.clientId);
  const client = await one('SELECT * FROM clients WHERE id=$1', [clientId]);
  if (!client) throw notFound('Client not found');
  const invoices = await query(`${invoiceSelect} WHERE i.client_id=$1 ORDER BY i.id`, [clientId]);
  const receipts = await query('SELECT r.*, i.invoice_no FROM receipts r JOIN invoices i ON i.id=r.invoice_id WHERE r.client_id=$1 ORDER BY r.id', [clientId]);
  const balance = Math.round(invoices.reduce((s: number, i: any) => s + i.balance, 0) * 100) / 100;
  res.json({ client, invoices, receipts, balance });
}));

collectionsRouter.post('/reminders/:invoiceId', requireModule('CLXN'), wrap(async (req, res) => {
  const invoiceId = idParam(req.params.invoiceId);
  const inv = await one<any>(`${invoiceSelect} WHERE i.id=$1`, [invoiceId]);
  if (!inv) throw notFound('Invoice not found');
  if (inv.status === 'paid') throw conflict('Invoice is already paid');
  await tx(async (c) => {
    await sendMail(c, { to: inv.client_email, subject: `Payment reminder – ${inv.invoice_no}`, body: `Dear ${inv.client_name},\n\nInvoice ${inv.invoice_no} for policy ${inv.policy_no} has an outstanding balance of PHP ${Number(inv.balance).toFixed(2)}, due ${inv.due_date}.\n\nBrokerVerse Collections`, template: 'payment-reminder', refType: 'invoice', refId: inv.id });
    await audit(c, req.user, { action: 'collections.reminder', entity: 'invoice', entityId: inv.id, after: { balance: inv.balance } });
  });
  res.json({ ok: true });
}));

/* ---------- Marketing diary: collection efforts ---------- */
collectionsRouter.get('/efforts/:invoiceId', wrap(async (req, res) => {
  const invoiceId = idParam(req.params.invoiceId);
  res.json({ efforts: await query('SELECT e.*, u.full_name AS by_name FROM collection_efforts e LEFT JOIN users u ON u.id=e.created_by WHERE invoice_id=$1 ORDER BY e.id DESC', [invoiceId]) });
}));

collectionsRouter.post('/efforts', requireModule('CLXN'), wrap(async (req, res) => {
  const b = parse(z.object({
    invoiceId: z.number().int().positive(), mode: z.enum(['call', 'email', 'visit', 'sms', 'messaging']), category: z.enum(['for_followup', 'committed', 'disputed', 'paid', 'for_cte', 'uncontactable']),
    commitmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), paymentArrangement: z.string().optional(), contactPerson: z.string().optional(), contactDetails: z.string().optional(), remarks: z.string().optional(),
  }), req.body);
  if (b.category === 'committed' && !b.commitmentDate) throw conflict('A payment commitment needs a commitment date');
  const inv = await one<any>(`${invoiceSelect} WHERE i.id=$1`, [b.invoiceId]);
  if (!inv) throw notFound('Invoice not found');
  const out = await tx(async (c) => {
    const r = await one<{ id: number }>('INSERT INTO collection_efforts(invoice_id, client_id, mode, category, commitment_date, payment_arrangement, contact_person, contact_details, remarks, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [b.invoiceId, inv.client_id, b.mode, b.category, b.commitmentDate ?? null, b.paymentArrangement ?? null, b.contactPerson ?? null, b.contactDetails ?? null, b.remarks ?? null, req.user!.id], c);
    const beyondTerm = b.commitmentDate && b.commitmentDate > inv.due_date;
    if (beyondTerm) await sendMail(c, { to: 'marketing-ao@brokerverse.local', subject: `Commitment beyond credit term – ${inv.invoice_no}`, body: `Client committed to pay on ${b.commitmentDate}, after the due date ${inv.due_date}. A credit-term extension (CTE) may be required.`, template: 'commitment-beyond-term', refType: 'invoice', refId: inv.id });
    await audit(c, req.user, { action: 'collections.effort', entity: 'invoice', entityId: inv.id, after: b });
    return { id: r!.id, beyondCreditTerm: !!beyondTerm };
  });
  res.status(201).json(out);
}));

/* ---------- Credit-term extension (CTE): requested by collections, approved by the unit head ---------- */
registerApprovalHandler('cte', async (c, a, decision, checker) => {
  const cte = await one<any>('SELECT * FROM credit_term_extensions WHERE id=$1 FOR UPDATE', [a.entity_id], c);
  if (decision !== 'approved') { await query("UPDATE credit_term_extensions SET status='rejected', decided_by=$2, decided_at=now() WHERE id=$1", [cte.id, checker.id], c); return { status: 'rejected' }; }
  const inv = await one<any>('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [cte.invoice_id], c);
  const newDue = addDays(inv.due_date, cte.requested_days);
  await query('UPDATE invoices SET due_date=$2, credit_term_days=credit_term_days+$3 WHERE id=$1', [inv.id, newDue, cte.requested_days], c);
  await query("UPDATE credit_term_extensions SET status='approved', decided_by=$2, decided_at=now(), previous_due_date=$3, new_due_date=$4 WHERE id=$1", [cte.id, checker.id, inv.due_date, newDue], c);
  await sendMail(c, { to: 'collections-handler@brokerverse.local', subject: `CTE approved – ${inv.invoice_no}`, body: `New due date ${newDue}.`, template: 'cte-approved', refType: 'invoice', refId: inv.id });
  return { status: 'approved', newDueDate: newDue };
});

collectionsRouter.get('/cte', wrap(async (_req, res) => {
  res.json({ extensions: await query('SELECT c.*, i.invoice_no, i.due_date, cl.name AS client_name FROM credit_term_extensions c JOIN invoices i ON i.id=c.invoice_id JOIN clients cl ON cl.id=i.client_id ORDER BY c.id DESC LIMIT 200') });
}));

collectionsRouter.post('/cte', requireModule('CLXN'), wrap(async (req, res) => {
  const b = parse(z.object({ invoiceId: z.number().int().positive(), requestedDays: z.number().int().min(1).max(180), reason: z.string().min(5) }), req.body);
  const inv = await one<any>(`${invoiceSelect} WHERE i.id=$1`, [b.invoiceId]);
  if (!inv) throw notFound('Invoice not found');
  if (inv.status === 'paid') throw conflict('Invoice is already paid');
  if (await one("SELECT 1 FROM credit_term_extensions WHERE invoice_id=$1 AND status='pending'", [b.invoiceId])) throw conflict('A CTE request is already pending for this invoice');
  const out = await tx(async (c) => {
    const r = await one<{ id: number }>('INSERT INTO credit_term_extensions(invoice_id, requested_days, reason, requested_by) VALUES ($1,$2,$3,$4) RETURNING id', [b.invoiceId, b.requestedDays, b.reason, req.user!.id], c);
    const approvalId = await createApproval(c, req.user!, { requestType: 'cte', entity: 'credit_term_extension', entityId: r!.id, summary: `Credit-term extension +${b.requestedDays} days on ${inv.invoice_no} (${inv.client_name})`, note: b.reason });
    await audit(c, req.user, { action: 'collections.cte.request', entity: 'invoice', entityId: inv.id, after: b });
    return { id: r!.id, approvalId };
  });
  res.status(201).json(out);
}));
